import {
  ApiErrorShape,
  CampusRequest,
  CardStatus,
  InboxItem,
  NearPathSummary,
  PathVisibility,
  RouteCard,
  RouteData,
  RutoLanguage,
  SharedPathDetail,
  SharedPathMode,
  SharedPathPoint,
  SharedPathSummary,
  TransitMode,
  UnplacedStep,
  UserProfile,
  VerifyCardResult,
} from './types';
import {
  computeRouteSha256,
  generateMockTxSignature,
  generateRandomSalt,
} from './utils/crypto';
import {
  computePolylineMeters,
  ComputedStepGeometry,
  haversineMeters,
} from './utils/geo';
import {
  applySimulatedTampering,
  buildInitialSharedPaths,
  buildSeedCards,
  INITIAL_REQUESTS,
  INITIAL_USERS,
  restoreTamperedCard,
  validateHandle,
} from './utils/seedData';

const API_BASE_URL = ""; // empty = mock mode (localStorage). When set, call the real server.

export { API_BASE_URL };

export function isConnectedMode(): boolean {
  return API_BASE_URL.trim().length > 0;
}

const MOCK_KEYS = {
  PROFILES: 'ruto_mock_profiles_v2',
  ACTIVE_HANDLE: 'ruto_mock_active_handle_v2',
  CARDS: 'ruto_mock_cards_v2',
  REQUESTS: 'ruto_mock_requests_v2',
  PATHS: 'ruto_mock_paths_v2',
};

/**
 * Standardized error wrapper ensuring all API errors come back as
 * { error: string, message?: string, status?: number }.
 */
export class RutoApiError extends Error implements ApiErrorShape {
  error: string;
  status: number;

  constructor(code: string, message?: string, status = 400) {
    super(message || friendlyMessageForCode(code));
    this.name = 'RutoApiError';
    this.error = code;
    this.status = status;
  }
}

export function friendlyMessageForCode(code: string, fallback?: string): string {
  switch (code) {
    case 'handle_taken':
      return 'That campus handle is already taken. Try adding a number or underscore.';
    case 'invalid_handle':
      return 'Handles must be 3–20 characters using only lowercase letters (a–z), numbers (0–9), and underscore (_).';
    case 'recipient_not_found':
      return 'Recipient handle was not found. Check the spelling or create that handle first.';
    case 'already_resolved':
      return 'This route card has already been accepted or declined.';
    case 'not_verified':
      return 'Verification failed — this route was changed after it was sent and cannot be accepted.';
    case 'card_not_found':
      return 'This route card could not be found.';
    case 'path_not_found':
      return 'This campus path could not be found in the library.';
    case 'invalid_path':
      return fallback || 'A saved path requires a title and at least 2 points.';
    case 'network_error':
      return fallback || 'Could not reach the server. Check your connection and tap Retry.';
    default:
      return fallback || 'Something went wrong. Please retry.';
  }
}

export function normalizeApiError(err: unknown): ApiErrorShape {
  if (err && typeof err === 'object' && 'error' in err) {
    const code = String((err as { error: unknown }).error || 'unknown_error');
    const rawMsg =
      'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : undefined;
    return {
      error: code,
      message: friendlyMessageForCode(code, rawMsg),
      status:
        'status' in err && typeof (err as { status?: unknown }).status === 'number'
          ? (err as { status: number }).status
          : undefined,
    };
  }
  const msg = err instanceof Error ? err.message : undefined;
  return {
    error: 'network_error',
    message: friendlyMessageForCode('network_error', msg),
  };
}

// ============================================================================
// INTERNAL STORAGE & HTTP HELPERS (Strictly private to src/api.ts)
// ============================================================================

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

let seedInitPromise: Promise<RouteCard[]> | null = null;

async function ensureMockStoreInitialized(): Promise<{
  profiles: UserProfile[];
  cards: RouteCard[];
  paths: SharedPathDetail[];
}> {
  let profiles = readStorage<UserProfile[] | null>(MOCK_KEYS.PROFILES, null);
  if (!profiles || profiles.length === 0) {
    profiles = INITIAL_USERS;
    writeStorage(MOCK_KEYS.PROFILES, profiles);
  }

  let paths = readStorage<SharedPathDetail[] | null>(MOCK_KEYS.PATHS, null);
  if (!paths || paths.length === 0) {
    paths = buildInitialSharedPaths();
    writeStorage(MOCK_KEYS.PATHS, paths);
  }

  let cards = readStorage<RouteCard[] | null>(MOCK_KEYS.CARDS, null);
  if (!cards) {
    if (!seedInitPromise) {
      seedInitPromise = buildSeedCards().then((seeded) => {
        writeStorage(MOCK_KEYS.CARDS, seeded);
        return seeded;
      });
    }
    cards = await seedInitPromise;
  }

  return { profiles, cards, paths };
}

async function requestRemoteJson<T>(
  endpointPath: string,
  options?: RequestInit
): Promise<T> {
  const base = API_BASE_URL.replace(/\/+$/, '');
  const url = `${base}${endpointPath}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : undefined;
    throw new RutoApiError(
      'network_error',
      friendlyMessageForCode('network_error', msg),
      0
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // ignore non-json body
  }

  if (!response.ok) {
    const code =
      typeof body.error === 'string' && body.error
        ? body.error
        : `http_${response.status}`;
    const message =
      typeof body.message === 'string'
        ? body.message
        : friendlyMessageForCode(code);
    throw new RutoApiError(code, message, response.status);
  }

  return body as T;
}

function normalizeStatus(raw: string): CardStatus {
  const lower = String(raw || 'pending').toLowerCase();
  if (lower === 'accepted') return 'accepted';
  if (lower === 'declined') return 'declined';
  return 'pending';
}

// ============================================================================
// SIX CORE CARD & PROFILE OPERATIONS (Real Server + Mock localStorage)
// ============================================================================

/**
 * 1. createProfile({ handle, avatarId })
 * POST /profiles -> { handle, avatarId, txSignature }
 * Error 409 { error: "handle_taken" } if the handle exists.
 */
export async function createProfile(input: {
  handle: string;
  avatarId: string;
  displayName?: string;
  subtitle?: string;
}): Promise<{ handle: string; avatarId: string; txSignature: string }> {
  const check = validateHandle(input.handle);
  if (!check.valid) {
    throw new RutoApiError('invalid_handle', check.error, 400);
  }
  const handle = check.normalized;
  const avatarId = (input.avatarId || 'ankara-gold').trim();

  if (isConnectedMode()) {
    const created = await requestRemoteJson<{
      handle: string;
      avatarId?: string;
      txSignature?: string;
    }>('/profiles', {
      method: 'POST',
      body: JSON.stringify({ handle, avatarId }),
    });

    const profiles = readStorage<UserProfile[]>(MOCK_KEYS.PROFILES, INITIAL_USERS);
    if (!profiles.some((p) => p.handle === created.handle)) {
      writeStorage(MOCK_KEYS.PROFILES, [
        {
          handle: created.handle,
          avatarId: created.avatarId || avatarId,
          txSignature: created.txSignature || generateMockTxSignature(),
          displayName: input.displayName?.trim() || `@${created.handle}`,
          subtitle: input.subtitle?.trim() || 'Campus Student',
        },
        ...profiles,
      ]);
    }

    return {
      handle: created.handle,
      avatarId: created.avatarId || avatarId,
      txSignature: created.txSignature || generateMockTxSignature(),
    };
  }

  const { profiles } = await ensureMockStoreInitialized();
  const exists = profiles.some((p) => p.handle.toLowerCase() === handle);
  if (exists) {
    throw new RutoApiError(
      'handle_taken',
      friendlyMessageForCode('handle_taken'),
      409
    );
  }

  const txSignature = generateMockTxSignature();
  const newProfile: UserProfile = {
    handle,
    avatarId,
    txSignature,
    displayName: input.displayName?.trim() || `@${handle}`,
    subtitle: input.subtitle?.trim() || 'Campus Student',
  };

  writeStorage(MOCK_KEYS.PROFILES, [newProfile, ...profiles]);
  return { handle, avatarId, txSignature };
}

/**
 * 2. sendCard({ from, to, route, directions, language })
 * POST /cards -> { id, hash, txSignature, createdAt }
 * Error 404 { error: "recipient_not_found" } if recipient handle does not exist.
 */
export async function sendCard(input: {
  from: string;
  to: string;
  route: RouteData;
  directions: string[];
  language: RutoLanguage;
}): Promise<{
  id: string;
  hash: string;
  txSignature: string;
  createdAt: number;
}> {
  const from = input.from.trim().replace(/^@+/, '').toLowerCase();
  const to = input.to.trim().replace(/^@+/, '').toLowerCase();

  if (!to) {
    throw new RutoApiError(
      'recipient_not_found',
      friendlyMessageForCode('recipient_not_found'),
      404
    );
  }

  if (isConnectedMode()) {
    const res = await requestRemoteJson<{
      id: string;
      hash: string;
      txSignature: string;
      createdAt?: number;
    }>('/cards', {
      method: 'POST',
      body: JSON.stringify({
        from,
        to,
        route: input.route,
        directions: input.directions,
        language: input.language,
      }),
    });

    return {
      id: res.id,
      hash: res.hash,
      txSignature: res.txSignature,
      createdAt: res.createdAt ?? Date.now(),
    };
  }

  const { profiles, cards } = await ensureMockStoreInitialized();
  const recipientExists = profiles.some((p) => p.handle.toLowerCase() === to);
  if (!recipientExists) {
    throw new RutoApiError(
      'recipient_not_found',
      `Handle @${to} does not exist yet. Create @${to} in Profile or pick a campus mate.`,
      404
    );
  }

  const id = `RT-${Math.floor(1000 + Math.random() * 9000)}`;
  const salt = generateRandomSalt();
  const txSignature = generateMockTxSignature();
  const createdAt = Date.now();

  const normalizedRoute: RouteData = {
    title: (input.route.title || 'Campus Route').trim(),
    mode: input.route.mode || 'Walk',
    personalNote: (input.route.personalNote || '').trim(),
    summaryNote: (
      input.route.summaryNote ||
      input.directions[0] ||
      input.route.title
    ).trim(),
    waypoints: input.route.waypoints.map((wp) => ({
      ...wp,
      name: wp.name.trim(),
      landmark: (wp.landmark || wp.name).trim(),
      turn: wp.turn || 'straight',
      note: (wp.note || '').trim(),
      lat: Number(Number(wp.lat).toFixed(6)),
      lng: Number(Number(wp.lng).toFixed(6)),
    })),
    directionsByLang: input.route.directionsByLang,
    summaryByLang: input.route.summaryByLang,
    category: input.route.category || 'Shortcuts',
    rating: 5.0,
    usesCount: 1,
  };

  const trimmedDirections = input.directions.map((d) => d.trim());

  const { hash } = await computeRouteSha256({
    id,
    from,
    to,
    salt,
    route: normalizedRoute,
    directions: trimmedDirections,
    language: input.language,
  });

  const newCard: RouteCard = {
    id,
    from,
    to,
    salt,
    route: normalizedRoute,
    directions: trimmedDirections,
    language: input.language,
    status: 'pending',
    hash,
    txSignature,
    createdAt,
  };

  writeStorage(MOCK_KEYS.CARDS, [newCard, ...cards]);
  return { id, hash, txSignature, createdAt };
}

/**
 * 3. getInbox(handle)
 * GET /inbox/:handle -> [{ id, from, title, status, createdAt, verified }]
 */
export async function getInbox(handle: string): Promise<InboxItem[]> {
  const cleanHandle = handle.trim().replace(/^@+/, '').toLowerCase();

  if (isConnectedMode()) {
    const list = await requestRemoteJson<
      Array<{
        id: string;
        from: string;
        title: string;
        status: string;
        createdAt: number;
        verified?: boolean;
      }>
    >(`/inbox/${encodeURIComponent(cleanHandle)}`, { method: 'GET' });

    return [...list]
      .map((item) => ({
        id: item.id,
        from: item.from,
        title: item.title,
        status: normalizeStatus(item.status),
        createdAt: Number(item.createdAt || Date.now()),
        verified: item.verified !== false,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  const { cards } = await ensureMockStoreInitialized();
  const matching = cards
    .filter((c) => c.to.toLowerCase() === cleanHandle)
    .sort((a, b) => b.createdAt - a.createdAt);

  const items: InboxItem[] = [];
  for (const c of matching) {
    const { hash: recomputed } = await computeRouteSha256(c);
    items.push({
      id: c.id,
      from: c.from,
      title: c.route.title,
      status: normalizeStatus(c.status),
      createdAt: c.createdAt,
      verified: recomputed === c.hash,
    });
  }
  return items;
}

/**
 * 4. getCard(id)
 * GET /cards/:id -> { id, from, to, route, directions, language, status, hash, txSignature, createdAt }
 */
export async function getCard(id: string): Promise<{
  id: string;
  from: string;
  to: string;
  route: RouteData;
  directions: string[];
  language: RutoLanguage;
  status: CardStatus;
  hash: string;
  txSignature: string;
  createdAt: number;
  isSimulatedTamper?: boolean;
}> {
  if (isConnectedMode()) {
    const c = await requestRemoteJson<{
      id: string;
      from: string;
      to: string;
      route: RouteData;
      directions?: string[];
      language?: RutoLanguage;
      status: string;
      hash: string;
      txSignature?: string;
      createdAt?: number;
    }>(`/cards/${encodeURIComponent(id)}`, { method: 'GET' });

    return {
      id: c.id,
      from: c.from,
      to: c.to,
      route: c.route,
      directions: c.directions || [],
      language: c.language || 'English',
      status: normalizeStatus(c.status),
      hash: c.hash,
      txSignature: c.txSignature || '',
      createdAt: c.createdAt ?? Date.now(),
    };
  }

  const { cards } = await ensureMockStoreInitialized();
  const found = cards.find((c) => c.id === id);
  if (!found) {
    throw new RutoApiError(
      'card_not_found',
      friendlyMessageForCode('card_not_found'),
      404
    );
  }

  return {
    id: found.id,
    from: found.from,
    to: found.to,
    route: found.route,
    directions: found.directions,
    language: found.language,
    status: normalizeStatus(found.status),
    hash: found.hash,
    txSignature: found.txSignature,
    createdAt: found.createdAt,
    isSimulatedTamper: Boolean(found._untamperedBackup),
  };
}

/**
 * 5. verifyCard(id)
 * GET /cards/:id/verify -> { verified: boolean, onChainHash, localHash }
 */
export async function verifyCard(id: string): Promise<VerifyCardResult> {
  if (isConnectedMode()) {
    const res = await requestRemoteJson<{
      verified: boolean;
      onChainHash: string;
      localHash: string;
    }>(`/cards/${encodeURIComponent(id)}/verify`, { method: 'GET' });

    return {
      verified: Boolean(res.verified),
      onChainHash: res.onChainHash,
      localHash: res.localHash,
    };
  }

  const { cards } = await ensureMockStoreInitialized();
  const found = cards.find((c) => c.id === id);
  if (!found) {
    throw new RutoApiError(
      'card_not_found',
      friendlyMessageForCode('card_not_found'),
      404
    );
  }

  const { hash: localHash, canonicalJson } = await computeRouteSha256(found);
  const onChainHash = String(found.hash || '').trim().toLowerCase();

  return {
    verified: Boolean(onChainHash) && localHash === onChainHash,
    onChainHash,
    localHash,
    canonicalJson,
  };
}

/**
 * 6. respondCard(id, accept)
 * POST /cards/:id/respond { accept } -> { status, txSignature }
 * Error 409 { error: "already_resolved" } if already accepted or declined.
 * Error 409 { error: "not_verified" } if verification fails.
 */
export async function respondCard(
  id: string,
  accept: boolean
): Promise<{ status: CardStatus; txSignature: string }> {
  if (isConnectedMode()) {
    const res = await requestRemoteJson<{
      status: string;
      txSignature?: string;
    }>(`/cards/${encodeURIComponent(id)}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    });

    return {
      status: normalizeStatus(res.status),
      txSignature: res.txSignature || generateMockTxSignature(),
    };
  }

  const { cards } = await ensureMockStoreInitialized();
  const found = cards.find((c) => c.id === id);
  if (!found) {
    throw new RutoApiError(
      'card_not_found',
      friendlyMessageForCode('card_not_found'),
      404
    );
  }

  if (normalizeStatus(found.status) !== 'pending') {
    throw new RutoApiError(
      'already_resolved',
      friendlyMessageForCode('already_resolved'),
      409
    );
  }

  const verification = await verifyCard(id);
  if (!verification.verified && accept) {
    throw new RutoApiError(
      'not_verified',
      friendlyMessageForCode('not_verified'),
      409
    );
  }

  const nextStatus: CardStatus = accept ? 'accepted' : 'declined';
  const txSignature = generateMockTxSignature();

  const updatedCards = cards.map((c) =>
    c.id === id ? { ...c, status: nextStatus, txSignature } : c
  );
  writeStorage(MOCK_KEYS.CARDS, updatedCards);

  return { status: nextStatus, txSignature };
}

// ============================================================================
// SHARED CAMPUS ROUTE LIBRARY OPERATIONS (POST/GET /paths, /near, /confirm)
// ============================================================================

/**
 * POST /paths
 * { title, startName, endName, mode, visibility: "card_only" | "public",
 *   points: [{ lat, lng, accuracy, label, note }], recordedBy } -> { id }
 */
export async function savePath(input: {
  title: string;
  startName: string;
  endName: string;
  mode: SharedPathMode;
  visibility: PathVisibility;
  points: SharedPathPoint[];
  recordedBy: string;
}): Promise<{ id: string }> {
  const title = input.title.trim();
  if (!title || input.points.length < 2) {
    throw new RutoApiError(
      'invalid_path',
      'Please enter a title and record at least 2 points.',
      400
    );
  }

  const sanitizedPoints: SharedPathPoint[] = input.points.map((pt) => ({
    lat: Number(Number(pt.lat).toFixed(6)),
    lng: Number(Number(pt.lng).toFixed(6)),
    accuracy: Math.max(1, Math.round(pt.accuracy || 10)),
    label: String(pt.label || '').trim(),
    note: String(pt.note || '').trim(),
  }));

  const payload = {
    title,
    startName: input.startName.trim() || sanitizedPoints[0].label || 'Start',
    endName:
      input.endName.trim() ||
      sanitizedPoints[sanitizedPoints.length - 1].label ||
      'Destination',
    mode: input.mode,
    visibility: input.visibility,
    points: sanitizedPoints,
    recordedBy: input.recordedBy.trim().replace(/^@+/, '').toLowerCase(),
  };

  if (isConnectedMode()) {
    return requestRemoteJson<{ id: string }>('/paths', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  const { paths } = await ensureMockStoreInitialized();
  const id = `PATH-${Math.floor(1000 + Math.random() * 9000)}`;
  const distanceMeters = computePolylineMeters(sanitizedPoints);

  const created: SharedPathDetail = {
    id,
    ...payload,
    distanceMeters,
    confirmations: 1,
    flags: 0,
    createdAt: Date.now(),
  };

  writeStorage(MOCK_KEYS.PATHS, [created, ...paths]);
  return { id };
}

/**
 * GET /paths?q=&from=&to=
 * Returns PUBLIC paths only:
 * [{ id, title, startName, endName, mode, distanceMeters, confirmations, flags }]
 */
export async function searchPaths(params: {
  q?: string;
  from?: string;
  to?: string;
}): Promise<SharedPathSummary[]> {
  const q = (params.q || '').trim();
  const from = (params.from || '').trim();
  const to = (params.to || '').trim();

  if (isConnectedMode()) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return requestRemoteJson<SharedPathSummary[]>(`/paths?${qs.toString()}`, {
      method: 'GET',
    });
  }

  const { paths } = await ensureMockStoreInitialized();
  const qLower = q.toLowerCase();
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();

  return paths
    .filter((p) => p.visibility === 'public')
    .filter((p) => {
      if (qLower) {
        const hay = [
          p.title,
          p.startName,
          p.endName,
          ...p.points.map((pt) => `${pt.label} ${pt.note}`),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      if (fromLower) {
        const startHay = `${p.startName} ${p.points[0]?.label || ''}`.toLowerCase();
        if (!startHay.includes(fromLower)) return false;
      }
      if (toLower) {
        const endHay = `${p.endName} ${
          p.points[p.points.length - 1]?.label || ''
        }`.toLowerCase();
        if (!endHay.includes(toLower)) return false;
      }
      return true;
    })
    .map((p) => ({
      id: p.id,
      title: p.title,
      startName: p.startName,
      endName: p.endName,
      mode: p.mode,
      distanceMeters: p.distanceMeters,
      confirmations: p.confirmations,
      flags: p.flags,
    }));
}

/**
 * GET /paths/near?lat=&lng=&radius=
 * Privacy rule: sends ONLY the rounded position (4 decimals, ~11m) for this query
 * and NEVER stores the user's position anywhere.
 * Returns public paths whose start is within radius (default 500m), sorted by distance.
 */
export async function getNearPaths(params: {
  lat: number;
  lng: number;
  radius?: number;
}): Promise<NearPathSummary[]> {
  const roundedLat = Number(Number(params.lat).toFixed(4));
  const roundedLng = Number(Number(params.lng).toFixed(4));
  const radius = params.radius ?? 500;

  if (isConnectedMode()) {
    const qs = new URLSearchParams({
      lat: String(roundedLat),
      lng: String(roundedLng),
      radius: String(radius),
    });
    return requestRemoteJson<NearPathSummary[]>(
      `/paths/near?${qs.toString()}`,
      { method: 'GET' }
    );
  }

  const { paths } = await ensureMockStoreInitialized();

  const matches: NearPathSummary[] = [];
  for (const p of paths) {
    if (p.visibility !== 'public' || p.points.length === 0) continue;
    const startPt = p.points[0];
    const distFromUser = Math.round(
      haversineMeters(roundedLat, roundedLng, startPt.lat, startPt.lng)
    );
    if (distFromUser <= radius) {
      matches.push({
        id: p.id,
        title: p.title,
        startName: p.startName,
        endName: p.endName,
        mode: p.mode,
        distanceMeters: p.distanceMeters,
        confirmations: p.confirmations,
        flags: p.flags,
        distanceFromUserMeters: distFromUser,
      });
    }
  }

  return matches.sort(
    (a, b) => a.distanceFromUserMeters - b.distanceFromUserMeters
  );
}

/**
 * GET /paths/:id -> full path with points
 */
export async function getPath(id: string): Promise<SharedPathDetail> {
  if (isConnectedMode()) {
    return requestRemoteJson<SharedPathDetail>(
      `/paths/${encodeURIComponent(id)}`,
      { method: 'GET' }
    );
  }

  const { paths } = await ensureMockStoreInitialized();
  const found = paths.find((p) => p.id === id);
  if (!found) {
    throw new RutoApiError(
      'path_not_found',
      friendlyMessageForCode('path_not_found'),
      404
    );
  }
  return found;
}

/**
 * POST /paths/:id/confirm { worked: boolean, note?: string } -> { confirmations, flags }
 */
export async function confirmPath(
  id: string,
  input: { worked: boolean; note?: string }
): Promise<{ confirmations: number; flags: number }> {
  const cleanNote = input.note?.trim() || undefined;

  if (isConnectedMode()) {
    return requestRemoteJson<{ confirmations: number; flags: number }>(
      `/paths/${encodeURIComponent(id)}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ worked: input.worked, note: cleanNote }),
      }
    );
  }

  const { paths } = await ensureMockStoreInitialized();
  const found = paths.find((p) => p.id === id);
  if (!found) {
    throw new RutoApiError(
      'path_not_found',
      friendlyMessageForCode('path_not_found'),
      404
    );
  }

  const nextConfirmations = input.worked
    ? found.confirmations + 1
    : found.confirmations;
  const nextFlags = input.worked ? found.flags : found.flags + 1;

  const updatedPaths = paths.map((p) => {
    if (p.id !== id) return p;
    const notes = p.feedbackNotes ? [...p.feedbackNotes] : [];
    if (cleanNote || !input.worked) {
      notes.unshift({
        worked: input.worked,
        note: cleanNote,
        createdAt: Date.now(),
      });
    }
    return {
      ...p,
      confirmations: nextConfirmations,
      flags: nextFlags,
      feedbackNotes: notes,
    };
  });

  writeStorage(MOCK_KEYS.PATHS, updatedPaths);
  return { confirmations: nextConfirmations, flags: nextFlags };
}

// ============================================================================
// SESSION, DEMO TAMPERING & EXPLORE HELPERS (All storage encapsulated here)
// ============================================================================

export async function getSessionData(): Promise<{
  profiles: UserProfile[];
  activeHandle: string;
  cards: RouteCard[];
  requests: CampusRequest[];
}> {
  const { profiles, cards } = await ensureMockStoreInitialized();
  const activeHandle = readStorage<string>(
    MOCK_KEYS.ACTIVE_HANDLE,
    profiles[0]?.handle || 'mary_hostel'
  );
  const requests = readStorage<CampusRequest[]>(
    MOCK_KEYS.REQUESTS,
    INITIAL_REQUESTS
  );
  return { profiles, activeHandle, cards, requests };
}

export function saveActiveHandle(handle: string): void {
  writeStorage(MOCK_KEYS.ACTIVE_HANDLE, handle.trim().toLowerCase());
}

export async function updateProfileAvatar(
  handle: string,
  avatarId: string
): Promise<UserProfile[]> {
  const { profiles } = await ensureMockStoreInitialized();
  const updated = profiles.map((p) =>
    p.handle === handle ? { ...p, avatarId } : p
  );
  writeStorage(MOCK_KEYS.PROFILES, updated);
  return updated;
}

export async function addCampusRouteRequest(params: {
  handle: string;
  avatarId: string;
  question: string;
  tag: string;
}): Promise<CampusRequest[]> {
  const existing = readStorage<CampusRequest[]>(
    MOCK_KEYS.REQUESTS,
    INITIAL_REQUESTS
  );
  const created: CampusRequest = {
    id: `req-${Date.now()}`,
    handle: params.handle,
    avatarId: params.avatarId,
    createdAt: Date.now(),
    question: params.question,
    tag: params.tag,
    routesOffered: 0,
    suggestedTitle: `${params.tag} Route`,
    suggestedPrompt: params.question,
  };
  const updated = [created, ...existing];
  writeStorage(MOCK_KEYS.REQUESTS, updated);
  return updated;
}

export async function toggleSimulateTampering(
  cardId: string
): Promise<RouteCard[]> {
  const { cards } = await ensureMockStoreInitialized();
  const updated = cards.map((c) => {
    if (c.id !== cardId) return c;
    return c._untamperedBackup
      ? restoreTamperedCard(c)
      : applySimulatedTampering(c);
  });
  writeStorage(MOCK_KEYS.CARDS, updated);
  return updated;
}

export async function triggerDemoIncomingCard(
  targetHandle: string
): Promise<{ id: string; from: string }> {
  const { profiles } = await ensureMockStoreInitialized();
  const sender =
    profiles.find((p) => p.handle !== targetHandle)?.handle || 'tobi_fuoye';

  const created = await sendCard({
    from: sender,
    to: targetHandle,
    language: 'Pidgin',
    route: {
      title: 'Senate Building → Night Shuttle Park',
      mode: 'Walk',
      personalNote: 'Shuttle dey load now! Follow the lit walkway.',
      summaryNote:
        'Pass Senate front lawn straight, turn right by solar lamp post to Shuttle Park.',
      waypoints: [
        {
          id: `wp-demo-1-${Date.now()}`,
          name: 'Senate Building Lawn',
          landmark: 'Flagpole Courtyard',
          turn: 'straight',
          note: 'Start in front of the Senate Building steps',
          lat: 7.77912,
          lng: 5.31488,
        },
        {
          id: `wp-demo-2-${Date.now()}`,
          name: 'Solar Lamp Junction',
          landmark: 'Double Solar Streetlight',
          turn: 'right',
          note: 'Turn right beside the double solar lamp post',
          lat: 7.77824,
          lng: 5.31594,
        },
        {
          id: `wp-demo-3-${Date.now()}`,
          name: 'Night Shuttle Park',
          landmark: 'Yellow Keke & Shuttle Stand',
          turn: 'straight',
          note: 'Arrive at the shuttle loading bay',
          lat: 7.77748,
          lng: 5.31682,
        },
      ],
    },
    directions: [
      'Start in front of Senate Building steps and waka straight across the walkway.',
      'Turn right when you reach the double solar lamp post.',
      'Go straight down to the Night Shuttle loading bay.',
    ],
  });

  return { id: created.id, from: sender };
}

export async function resetMockDemoStorage(): Promise<{
  profiles: UserProfile[];
  activeHandle: string;
  cards: RouteCard[];
  requests: CampusRequest[];
}> {
  try {
    localStorage.removeItem(MOCK_KEYS.PROFILES);
    localStorage.removeItem(MOCK_KEYS.ACTIVE_HANDLE);
    localStorage.removeItem(MOCK_KEYS.CARDS);
    localStorage.removeItem(MOCK_KEYS.REQUESTS);
    localStorage.removeItem(MOCK_KEYS.PATHS);
  } catch {
    // ignore
  }
  seedInitPromise = null;
  return getSessionData();
}

// ============================================================================
// GEMMA 4 AI OPERATIONS (Server-side Gemini API proxy; NEVER receives live GPS)
// ============================================================================

async function postGemmaEndpoint<T>(url: string, payload: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : undefined;
    throw new RutoApiError(
      'network_error',
      friendlyMessageForCode('network_error', msg),
      0
    );
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // ignore
  }

  if (!response.ok) {
    const errMsg =
      typeof data?.error === 'string'
        ? data.error
        : `Gemma 4 request failed (${response.status}). Tap Retry.`;
    throw new RutoApiError('gemma_error', errMsg, response.status);
  }

  return data as T;
}

export async function parseTextToRouteWithGemma(description: string): Promise<{
  routeTitle: string;
  detectedLanguage: RutoLanguage;
  steps: UnplacedStep[];
  modelUsed: string;
}> {
  const res = await postGemmaEndpoint<{
    routeTitle: string;
    detectedLanguage: RutoLanguage;
    steps: Array<{
      placeName: string;
      landmark: string;
      turn: 'straight' | 'left' | 'right';
      note: string;
    }>;
    modelUsed: string;
  }>('/api/ai/text-to-route', { description });

  return {
    routeTitle: res.routeTitle,
    detectedLanguage: res.detectedLanguage,
    modelUsed: res.modelUsed,
    steps: res.steps.map((s, idx) => ({
      id: `step-${Date.now()}-${idx}`,
      placeName: s.placeName,
      landmark: s.landmark,
      turn: s.turn,
      note: s.note,
    })),
  };
}

/**
 * Sends ONLY ordered step names, notes, and code-computed distances & turns to Gemma 4.
 * NEVER sends live GPS location or coordinates.
 */
export async function generateRouteDirectionsWithGemma(params: {
  language: RutoLanguage;
  mode: TransitMode;
  steps: ComputedStepGeometry[];
}): Promise<{
  language: RutoLanguage;
  summaryNote: string;
  directions: Array<{ stepNumber: number; instruction: string }>;
  modelUsed: string;
}> {
  return postGemmaEndpoint('/api/ai/route-to-directions', params);
}

export async function describeLandmarkPhotoWithGemma(params: {
  imageBase64: string;
  mimeType: string;
}): Promise<{
  landmarkNote: string;
  suggestedSpotName: string;
  modelUsed: string;
}> {
  return postGemmaEndpoint('/api/ai/photo-to-landmark', params);
}

export function compressImageFile(
  file: File,
  maxDimension = 840
): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(
        new RutoApiError('invalid_image', 'Could not read the selected photo.')
      );
    reader.onload = () => {
      const img = new Image();
      img.onerror = () =>
        reject(
          new RutoApiError(
            'invalid_image',
            'Selected file is not a valid image.'
          )
        );
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            dataUrl: String(reader.result),
            mimeType: file.type || 'image/jpeg',
          });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const mimeType = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, 0.8);
        resolve({ dataUrl, mimeType });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
