import { RouteData, RutoLanguage } from '../types';

export interface CanonicalCardHashInput {
  id: string;
  from: string;
  to: string;
  salt: string;
  route: RouteData;
  directions: string[];
  language: RutoLanguage | string;
}

/**
 * Generates a cryptographically random 16-byte hex salt via Web Crypto API.
 */
export function generateRandomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateMockTxSignature(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex}`;
}

/**
 * Creates a deterministic canonical JSON string of a route card:
 * - Fixed key order on root object, route, and each waypoint
 * - Coordinates rounded to 6 decimal places
 * - All string fields trimmed
 * - Includes card id, from, to, and random salt
 */
export function buildCanonicalRouteJson(card: CanonicalCardHashInput): string {
  const route = card.route;
  const canonicalPayload = {
    id: String(card.id || '').trim(),
    from: String(card.from || '').trim().toLowerCase(),
    to: String(card.to || '').trim().toLowerCase(),
    salt: String(card.salt || '').trim(),
    language: String(card.language || 'English').trim(),
    route: {
      title: String(route?.title || '').trim(),
      mode: String(route?.mode || 'Walk').trim(),
      personalNote: String(route?.personalNote || '').trim(),
      waypoints: (route?.waypoints || []).map((wp, index) => ({
        index: index + 1,
        name: String(wp.name || '').trim(),
        landmark: String(wp.landmark || '').trim(),
        turn: String(wp.turn || 'straight').trim(),
        note: String(wp.note || '').trim(),
        lat: Number(Number(wp.lat).toFixed(6)),
        lng: Number(Number(wp.lng).toFixed(6)),
      })),
    },
    directions: (card.directions || []).map((step) => String(step || '').trim()),
  };

  return JSON.stringify(canonicalPayload);
}

/**
 * Computes the SHA-256 hex digest of the canonical route JSON using the Web Crypto API.
 */
export async function computeRouteSha256(card: CanonicalCardHashInput): Promise<{
  hash: string;
  canonicalJson: string;
}> {
  const canonicalJson = buildCanonicalRouteJson(card);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(canonicalJson);
  const digestBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(digestBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return { hash, canonicalJson };
}

export function formatShortHash(hash: string): string {
  if (!hash || hash.length < 12) return hash || 'unhashed';
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}
