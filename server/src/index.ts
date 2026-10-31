import "dotenv/config";
import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import * as chain from "./chain";
import * as store from "./db";
import { computeRouteHash, computeRouteHashHex, newSalt, profileDataHash } from "./hash";

/* ------------------------------ constants ------------------------------- */

const PORT = Number(process.env.PORT) || 8787;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const MAX_POINTS = 60;
const MAX_TEXT = 5000;

/* -------------------------------- errors -------------------------------- */

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}
const bad = (message: string) => new ApiError(400, "invalid_request", message);

/* ----------------------------- validation ------------------------------- */

type Obj = Record<string, unknown>;

function asObject(v: unknown, field: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw bad(`${field} must be an object`);
  }
  return v as Obj;
}

/** Counts every character of free text; throws once the total passes MAX_TEXT. */
function makeBudget() {
  let used = 0;
  return (s: string) => {
    used += s.length;
    if (used > MAX_TEXT) throw bad(`total text must be at most ${MAX_TEXT} characters`);
  };
}
type Budget = ReturnType<typeof makeBudget>;

function parseHandle(v: unknown, field: string): string {
  if (typeof v !== "string" || !HANDLE_RE.test(v)) {
    throw bad(`${field} must match ^[a-z0-9_]{3,20}$`);
  }
  return v;
}

function optStr(v: unknown, field: string, max: number): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw bad(`${field} must be a string`);
  if (v.length > max) throw bad(`${field} must be at most ${max} characters`);
  return v;
}

function reqStr(v: unknown, field: string, max: number): string {
  const s = optStr(v, field, max);
  if (s.trim() === "") throw bad(`${field} is required`);
  return s;
}

function parseNumber(v: unknown, field: string): number {
  const ok = typeof v === "number" || (typeof v === "string" && v.trim() !== "");
  const n = ok ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw bad(`${field} must be a number`);
  return n;
}

function parseCoord(v: unknown, kind: "lat" | "lng", field: string): number {
  const n = parseNumber(v, field);
  const lim = kind === "lat" ? 90 : 180;
  if (n < -lim || n > lim) throw bad(`${field} must be between ${-lim} and ${lim}`);
  return n;
}

function parseMode(v: unknown): string {
  if (v === undefined || v === null || v === "") return "walk";
  if (typeof v !== "string" || !/^[A-Za-z0-9_ -]{1,32}$/.test(v)) {
    throw bad("mode must be a short string (letters, digits, space, _ or -)");
  }
  return v;
}

interface CleanPoint {
  lat: number;
  lng: number;
  label: string;
  note: string;
  accuracy?: number;
}

function parsePoints(v: unknown, field: string, budget: Budget, withAccuracy: boolean): CleanPoint[] {
  if (!Array.isArray(v) || v.length < 1) throw bad(`${field} must be a non-empty array`);
  if (v.length > MAX_POINTS) throw bad(`${field} must have at most ${MAX_POINTS} points`);
  return v.map((raw, i) => {
    const p = asObject(raw, `${field}[${i}]`);
    const label = optStr(p.label, `${field}[${i}].label`, MAX_TEXT);
    const note = optStr(p.note, `${field}[${i}].note`, MAX_TEXT);
    budget(label);
    budget(note);
    const out: CleanPoint = {
      lat: parseCoord(p.lat, "lat", `${field}[${i}].lat`),
      lng: parseCoord(p.lng, "lng", `${field}[${i}].lng`),
      label,
      note,
    };
    if (withAccuracy && p.accuracy !== undefined && p.accuracy !== null) {
      const a = parseNumber(p.accuracy, `${field}[${i}].accuracy`);
      if (a < 0) throw bad(`${field}[${i}].accuracy must be >= 0`);
      out.accuracy = a;
    }
    return out;
  });
}

interface CleanRoute {
  title?: string;
  mode: string;
  points: CleanPoint[];
}

function parseRoute(v: unknown, budget: Budget): CleanRoute {
  const r = asObject(v, "route");
  const title = optStr(r.title, "route.title", MAX_TEXT).trim();
  budget(title);
  const route: CleanRoute = {
    mode: parseMode(r.mode),
    points: parsePoints(r.points, "route.points", budget, false),
  };
  if (title) route.title = title;
  return route;
}

/** directions may be a string or any JSON array/object; stored as JSON. */
function parseDirections(v: unknown, budget: Budget): unknown {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") {
    budget(v);
    return v;
  }
  if (typeof v === "object") {
    budget(JSON.stringify(v));
    return v;
  }
  throw bad("directions must be a string, array or object");
}

/* -------------------------------- geo ----------------------------------- */

const R_EARTH = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pathLength(points: { lat: number; lng: number }[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return d;
}

/* ------------------------------- helpers -------------------------------- */

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

const qs = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

function cardRoute(card: store.CardRow): CleanRoute {
  return JSON.parse(card.routeJson) as CleanRoute;
}

function cardTitle(route: CleanRoute): string {
  if (route.title) return route.title;
  const first = route.points[0]?.label?.trim() || "Start";
  const last = route.points[route.points.length - 1]?.label?.trim() || "End";
  return `${first} to ${last}`;
}

function localHashOf(card: store.CardRow): string {
  return computeRouteHashHex({
    cardId: card.id,
    from: card.from,
    to: card.to,
    salt: card.salt,
    route: cardRoute(card),
  });
}

async function verifyCard(card: store.CardRow) {
  const onChainHash = await chain.fetchCardRouteHashHex(card.cardPda);
  const localHash = localHashOf(card);
  return { verified: onChainHash !== null && onChainHash === localHash, onChainHash, localHash };
}

const flagsOf = (worked: number, notWorked: number): string[] =>
  notWorked >= 3 && notWorked > worked ? ["may_be_outdated"] : [];

function pathSummary(p: store.PathRow) {
  return {
    id: p.id,
    title: p.title,
    startName: p.startName,
    endName: p.endName,
    mode: p.mode,
    distanceMeters: Math.round(p.distanceMeters),
    confirmations: p.worked,
    flags: flagsOf(p.worked, p.notWorked),
  };
}

/* --------------------------------- app ---------------------------------- */

const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) {
  const t = process.env.TRUST_PROXY;
  app.set("trust proxy", /^\d+$/.test(t) ? Number(t) : t);
}

app.use(
  cors({
    origin: ALLOWED_ORIGIN === "*" ? "*" : ALLOWED_ORIGIN.split(",").map((s) => s.trim()),
  }),
);

const limited = (_req: Request, res: Response) =>
  res.status(429).json({ error: "rate_limited", message: "Too many requests, slow down." });

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: limited,
  }),
);
const profileLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  handler: (_req, res) =>
    res
      .status(429)
      .json({ error: "rate_limited", message: "Profile creation limit reached (5 per hour)." }),
});

app.use(express.json({ limit: "1mb" }));

/* ------------------------------ info routes ----------------------------- */

app.get("/config", (_req, res) => {
  res.json(chain.info());
});

app.get(
  "/health",
  wrap(async (_req, res) => {
    try {
      res.json({ ok: true, ...(await chain.health()) });
    } catch (e: any) {
      res.status(503).json({ ok: false, error: "chain_error", message: e?.message });
    }
  }),
);

/* ------------------------------- PHASE 1 -------------------------------- */

// 1. Create profile
app.post(
  "/profiles",
  profileLimiter,
  wrap(async (req, res) => {
    const body = asObject(req.body, "body");
    const handle = parseHandle(body.handle, "handle");
    const avatarId = parseNumber(body.avatarId, "avatarId");
    if (!Number.isInteger(avatarId) || avatarId < 0 || avatarId > 255) {
      throw bad("avatarId must be an integer between 0 and 255");
    }

    if (store.getProfile(handle)) throw new ApiError(409, "handle_taken");

    const txSignature = await chain.createProfile(handle, avatarId, profileDataHash(handle, avatarId));

    store.insertProfile({
      handle,
      avatarId,
      dataHash: profileDataHash(handle, avatarId).toString("hex"),
      txSignature,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ handle, avatarId, txSignature });
  }),
);

// 2. Create and send a card
app.post(
  "/cards",
  wrap(async (req, res) => {
    const body = asObject(req.body, "body");
    const from = parseHandle(body.from, "from");
    const to = parseHandle(body.to, "to");
    if (from === to) throw bad("a card cannot be sent to yourself");
    const budget = makeBudget();
    const route = parseRoute(body.route, budget);
    const directions = parseDirections(body.directions, budget);
    const language = optStr(body.language, "language", 32).trim() || "en";

    if (!store.getProfile(from)) throw new ApiError(404, "sender_not_found");
    if (!store.getProfile(to)) throw new ApiError(404, "recipient_not_found");

    const id = randomUUID();
    const salt = newSalt();
    const hashBuf = computeRouteHash({ cardId: id, from, to, salt, route });

    const sent = await chain.sendRouteCard(from, to, hashBuf);

    const createdAt = new Date().toISOString();
    store.insertCard({
      id,
      from,
      to,
      routeJson: JSON.stringify(route),
      directionsJson: JSON.stringify(directions),
      language,
      hash: hashBuf.toString("hex"),
      salt,
      txSignature: sent.signature,
      cardPda: sent.cardPda,
      cardIndex: sent.index,
      createdAt,
    });

    res.status(201).json({ id, hash: hashBuf.toString("hex"), txSignature: sent.signature, createdAt });
  }),
);

// 3. Inbox
app.get(
  "/inbox/:handle",
  wrap((req, res) => {
    const handle = parseHandle(req.params.handle, "handle");
    res.json(
      store.inboxFor(handle).map((c) => ({
        id: c.id,
        from: c.from,
        title: cardTitle(cardRoute(c)),
        status: c.status,
        createdAt: c.createdAt,
      })),
    );
  }),
);

// 4. Card detail
app.get(
  "/cards/:id",
  wrap((req, res) => {
    const c = store.getCard(req.params.id);
    if (!c) throw new ApiError(404, "card_not_found");
    res.json({
      id: c.id,
      from: c.from,
      to: c.to,
      route: cardRoute(c),
      directions: JSON.parse(c.directionsJson),
      language: c.language,
      status: c.status,
      hash: c.hash,
      txSignature: c.txSignature,
      createdAt: c.createdAt,
    });
  }),
);

// 5. Verify against the chain
app.get(
  "/cards/:id/verify",
  wrap(async (req, res) => {
    const c = store.getCard(req.params.id);
    if (!c) throw new ApiError(404, "card_not_found");
    res.json(await verifyCard(c));
  }),
);

// 6. Respond
app.post(
  "/cards/:id/respond",
  wrap(async (req, res) => {
    const body = asObject(req.body, "body");
    if (typeof body.accept !== "boolean") throw bad("accept must be a boolean");
    const accept = body.accept;

    const first = store.getCard(req.params.id);
    if (!first) throw new ApiError(404, "card_not_found");

    // Serialise responses to the same card inside this process.
    const result = await chain.withLock(`respond:${first.id}`, async () => {
      const c = store.getCard(first.id)!;

      const v = await verifyCard(c);
      if (!v.verified) throw new ApiError(409, "not_verified");
      if (c.status !== "pending") throw new ApiError(409, "already_resolved");

      const txSignature = await chain.respondCard(c.to, c.cardPda, accept);
      const status = accept ? "accepted" : "declined";
      if (!store.resolveCard(c.id, status, txSignature)) {
        throw new ApiError(409, "already_resolved");
      }
      return { status, txSignature };
    });

    res.json(result);
  }),
);

/* ------------------------------- PHASE 2 -------------------------------- */

// 7. Record a path
app.post(
  "/paths",
  wrap((req, res) => {
    const body = asObject(req.body, "body");
    const budget = makeBudget();
    const title = reqStr(body.title, "title", 200).trim();
    const startName = reqStr(body.startName, "startName", 200).trim();
    const endName = reqStr(body.endName, "endName", 200).trim();
    budget(title);
    budget(startName);
    budget(endName);
    const mode = parseMode(body.mode);
    if (body.visibility !== "card_only" && body.visibility !== "public") {
      throw bad('visibility must be "card_only" or "public"');
    }
    const visibility = body.visibility;
    const points = parsePoints(body.points, "points", budget, true);
    const recordedBy = parseHandle(body.recordedBy, "recordedBy");

    const id = randomUUID();
    store.insertPath({
      id,
      title,
      startName,
      endName,
      mode,
      visibility,
      pointsJson: JSON.stringify(points),
      recordedBy,
      distanceMeters: pathLength(points),
      firstLat: points[0].lat,
      firstLng: points[0].lng,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ id });
  }),
);

// 8. Search public paths
app.get(
  "/paths",
  wrap((req, res) => {
    const rows = store.searchPublicPaths(qs(req.query.q), qs(req.query.from), qs(req.query.to));
    res.json(rows.map(pathSummary));
  }),
);

// 9. Public paths near a point (declared before /paths/:id on purpose).
// The query coordinates are used in memory only: never logged, never stored.
app.get(
  "/paths/near",
  wrap((req, res) => {
    const lat = parseCoord(qs(req.query.lat), "lat", "lat");
    const lng = parseCoord(qs(req.query.lng), "lng", "lng");
    const radius = qs(req.query.radius) === undefined ? 500 : parseNumber(req.query.radius, "radius");
    if (radius <= 0 || radius > 50_000) throw bad("radius must be between 1 and 50000 metres");

    const dLat = radius / 111_320 + 1e-6;
    const candidates = store.publicPathsInLatBand(lat - dLat, lat + dLat);

    const out = candidates
      .map((p) => ({ p, d: haversine(lat, lng, p.firstLat, p.firstLng) }))
      .filter((x) => x.d <= radius)
      .sort((a, b) => a.d - b.d)
      .map((x) => ({ ...pathSummary(x.p), distanceFromUserMeters: Math.round(x.d) }));
    res.json(out);
  }),
);

// 10. Full path
app.get(
  "/paths/:id",
  wrap((req, res) => {
    const p = store.getPath(req.params.id);
    if (!p) throw new ApiError(404, "path_not_found");
    if (p.visibility === "card_only" && qs(req.query.as) !== p.recordedBy) {
      throw new ApiError(404, "path_not_found");
    }
    res.json({
      ...pathSummary(p),
      visibility: p.visibility,
      recordedBy: p.recordedBy,
      points: JSON.parse(p.pointsJson),
      createdAt: p.createdAt,
    });
  }),
);

// 11. Confirm / flag
app.post(
  "/paths/:id/confirm",
  wrap((req, res) => {
    const body = asObject(req.body, "body");
    if (typeof body.worked !== "boolean") throw bad("worked must be a boolean");
    const note = optStr(body.note, "note", 500).trim() || null;
    const handle =
      body.handle === undefined || body.handle === null ? null : parseHandle(body.handle, "handle");

    const p = store.getPath(req.params.id);
    if (!p) throw new ApiError(404, "path_not_found");
    // Private paths can only be voted on by the person who recorded them.
    if (p.visibility === "card_only" && handle !== p.recordedBy) {
      throw new ApiError(404, "path_not_found");
    }

    const c = store.addVote(p.id, body.worked, note, handle);
    res.json({ confirmations: c.worked, flags: flagsOf(c.worked, c.notWorked) });
  }),
);

/* ------------------------------ fallbacks ------------------------------- */

app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    return res
      .status(err.status)
      .json({ error: err.code, ...(err.message !== err.code ? { message: err.message } : {}) });
  }
  if (err instanceof chain.ChainError) {
    switch (err.kind) {
      case "handle_taken":
        return res.status(409).json({ error: "handle_taken" });
      case "sender_not_found":
        return res.status(404).json({ error: "sender_not_found" });
      case "recipient_not_found":
        return res.status(404).json({ error: "recipient_not_found" });
      default:
        return res.status(502).json({ error: "chain_error", message: err.message });
    }
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "invalid_json", message: "Request body is not valid JSON." });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "payload_too_large", message: "Body limit is 1mb." });
  }
  console.error("[error]", String(err?.message ?? err).slice(0, 300));
  res.status(500).json({ error: "internal_error" });
});

/* -------------------------------- start --------------------------------- */

async function main() {
  try {
    await chain.initChain();
  } catch (e: any) {
    console.error(`\nFATAL: ${e?.message ?? e}\n`);
    process.exit(1);
  }
  const i = chain.info();
  app.listen(PORT, () => {
    console.log(`ruto-server listening on :${PORT}`);
    console.log(`  cluster   ${i.cluster}`);
    console.log(`  program   ${i.programId}`);
    console.log(`  authority ${i.authority}`);
  });
}

void main();
