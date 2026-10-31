import { createHash, randomBytes } from "node:crypto";

export interface HashPoint {
  lat: number | string;
  lng: number | string;
  label?: string | null;
  note?: string | null;
}

export interface HashRoute {
  mode?: string | null;
  points: HashPoint[];
}

export interface CardHashInput {
  cardId: string;
  from: string;
  to: string;
  salt: string;
  route: HashRoute;
}

/** Trimmed, NFC-normalised string; anything that is not a string becomes "". */
const text = (s: unknown): string =>
  (typeof s === "string" ? s : "").trim().normalize("NFC");

/** Fixed 6-decimal string so that hashing never depends on float formatting. */
const coord = (x: number | string): string => Number(x).toFixed(6);

export const sha256 = (s: string): Buffer =>
  createHash("sha256").update(s, "utf8").digest();

/**
 * Exact canonical JSON for a card. Key order is fixed by construction:
 * {v, cardId, from, to, salt, mode, points:[{lat, lng, label, note}]}
 * No whitespace (JSON.stringify default).
 */
export function canonicalCardJson(i: CardHashInput): string {
  const mode =
    typeof i.route.mode === "string" && i.route.mode !== "" ? i.route.mode : "walk";
  return JSON.stringify({
    v: 1,
    cardId: i.cardId,
    from: i.from,
    to: i.to,
    salt: i.salt,
    mode,
    points: i.route.points.map((p) => ({
      lat: coord(p.lat),
      lng: coord(p.lng),
      label: text(p.label),
      note: text(p.note),
    })),
  });
}

/** routeHash = SHA-256 over the UTF-8 bytes of the canonical JSON (32 bytes). */
export function computeRouteHash(i: CardHashInput): Buffer {
  return sha256(canonicalCardJson(i));
}

export const computeRouteHashHex = (i: CardHashInput): string =>
  computeRouteHash(i).toString("hex");

/** 16 random bytes, hex. Generated once per card and stored with it. */
export const newSalt = (): string => randomBytes(16).toString("hex");

/** dataHash for a profile = SHA-256 of canonical JSON {handle, avatarId}. */
export function profileDataHash(handle: string, avatarId: number): Buffer {
  return sha256(JSON.stringify({ handle, avatarId }));
}
