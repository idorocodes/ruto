import "dotenv/config";
import Database from "better-sqlite3";

export type CardStatus = "pending" | "accepted" | "declined";

export interface ProfileRow {
  handle: string;
  avatarId: number;
  dataHash: string;
  txSignature: string;
  createdAt: string;
}

export interface CardRow {
  id: string;
  from: string;
  to: string;
  routeJson: string;
  directionsJson: string;
  language: string;
  status: CardStatus;
  hash: string;
  salt: string;
  txSignature: string;
  cardPda: string;
  cardIndex: number;
  respondTx: string | null;
  createdAt: string;
}

export interface PathRow {
  id: string;
  title: string;
  startName: string;
  endName: string;
  mode: string;
  visibility: "card_only" | "public";
  recordedBy: string;
  distanceMeters: number;
  firstLat: number;
  firstLng: number;
  createdAt: string;
  worked: number;
  notWorked: number;
}

export interface PathFullRow extends PathRow {
  pointsJson: string;
}

const db = new Database(process.env.DB_PATH || "./ruto.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS profiles (
  handle       TEXT PRIMARY KEY,
  avatar_id    INTEGER NOT NULL,
  data_hash    TEXT NOT NULL,
  tx_signature TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id              TEXT PRIMARY KEY,
  from_handle     TEXT NOT NULL,
  to_handle       TEXT NOT NULL,
  route_json      TEXT NOT NULL,
  directions_json TEXT NOT NULL,
  language        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','declined')),
  hash            TEXT NOT NULL,
  salt            TEXT NOT NULL,
  tx_signature    TEXT NOT NULL,
  card_pda        TEXT NOT NULL,
  card_index      INTEGER NOT NULL,
  respond_tx      TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_to ON cards (to_handle, created_at);

CREATE TABLE IF NOT EXISTS paths (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  start_name  TEXT NOT NULL,
  end_name    TEXT NOT NULL,
  mode        TEXT NOT NULL,
  visibility  TEXT NOT NULL CHECK (visibility IN ('card_only','public')),
  points_json TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  distance_m  REAL NOT NULL,
  first_lat   REAL NOT NULL,
  first_lng   REAL NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paths_vis_lat ON paths (visibility, first_lat);

CREATE TABLE IF NOT EXISTS path_votes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  path_id    TEXT NOT NULL REFERENCES paths (id),
  worked     INTEGER NOT NULL,
  note       TEXT,
  handle     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_votes_path ON path_votes (path_id);
`);

/* ------------------------------ profiles ------------------------------ */

const qGetProfile = db.prepare(
  `SELECT handle, avatar_id AS avatarId, data_hash AS dataHash,
          tx_signature AS txSignature, created_at AS createdAt
   FROM profiles WHERE handle = ?`,
);
const qInsertProfile = db.prepare(
  `INSERT INTO profiles (handle, avatar_id, data_hash, tx_signature, created_at)
   VALUES (@handle, @avatarId, @dataHash, @txSignature, @createdAt)`,
);

export const getProfile = (handle: string) =>
  qGetProfile.get(handle) as ProfileRow | undefined;
export const insertProfile = (p: ProfileRow) => void qInsertProfile.run(p);

/* ------------------------------- cards -------------------------------- */

const CARD_COLS = `id, from_handle AS "from", to_handle AS "to", route_json AS routeJson,
  directions_json AS directionsJson, language, status, hash, salt,
  tx_signature AS txSignature, card_pda AS cardPda, card_index AS cardIndex,
  respond_tx AS respondTx, created_at AS createdAt`;

const qInsertCard = db.prepare(
  `INSERT INTO cards (id, from_handle, to_handle, route_json, directions_json, language,
                      status, hash, salt, tx_signature, card_pda, card_index, created_at)
   VALUES (@id, @from, @to, @routeJson, @directionsJson, @language,
           'pending', @hash, @salt, @txSignature, @cardPda, @cardIndex, @createdAt)`,
);
const qGetCard = db.prepare(`SELECT ${CARD_COLS} FROM cards WHERE id = ?`);
const qInbox = db.prepare(
  `SELECT ${CARD_COLS} FROM cards WHERE to_handle = ?
   ORDER BY created_at DESC, rowid DESC`,
);
const qResolveCard = db.prepare(
  `UPDATE cards SET status = ?, respond_tx = ? WHERE id = ? AND status = 'pending'`,
);

export type NewCard = Omit<CardRow, "status" | "respondTx">;
export const insertCard = (c: NewCard) => void qInsertCard.run(c);
export const getCard = (id: string) => qGetCard.get(id) as CardRow | undefined;
export const inboxFor = (handle: string) => qInbox.all(handle) as CardRow[];
/** Returns true if the card was still pending and has now been resolved. */
export const resolveCard = (id: string, status: "accepted" | "declined", tx: string) =>
  qResolveCard.run(status, tx, id).changes === 1;

/* ------------------------------- paths -------------------------------- */

const PATH_COLS = `p.id, p.title, p.start_name AS startName, p.end_name AS endName,
  p.mode, p.visibility, p.recorded_by AS recordedBy, p.distance_m AS distanceMeters,
  p.first_lat AS firstLat, p.first_lng AS firstLng, p.created_at AS createdAt,
  (SELECT COUNT(*) FROM path_votes v WHERE v.path_id = p.id AND v.worked = 1) AS worked,
  (SELECT COUNT(*) FROM path_votes v WHERE v.path_id = p.id AND v.worked = 0) AS notWorked`;

const qInsertPath = db.prepare(
  `INSERT INTO paths (id, title, start_name, end_name, mode, visibility, points_json,
                      recorded_by, distance_m, first_lat, first_lng, created_at)
   VALUES (@id, @title, @startName, @endName, @mode, @visibility, @pointsJson,
           @recordedBy, @distanceMeters, @firstLat, @firstLng, @createdAt)`,
);
const qGetPath = db.prepare(
  `SELECT ${PATH_COLS}, p.points_json AS pointsJson FROM paths p WHERE p.id = ?`,
);
const qPathLatBand = db.prepare(
  `SELECT ${PATH_COLS} FROM paths p
   WHERE p.visibility = 'public' AND p.first_lat BETWEEN ? AND ?`,
);
const qDeleteVoteByHandle = db.prepare(
  `DELETE FROM path_votes WHERE path_id = ? AND handle = ?`,
);
const qInsertVote = db.prepare(
  `INSERT INTO path_votes (path_id, worked, note, handle, created_at)
   VALUES (?, ?, ?, ?, ?)`,
);
const qVoteCounts = db.prepare(
  `SELECT
     COALESCE(SUM(CASE WHEN worked = 1 THEN 1 ELSE 0 END), 0) AS worked,
     COALESCE(SUM(CASE WHEN worked = 0 THEN 1 ELSE 0 END), 0) AS notWorked
   FROM path_votes WHERE path_id = ?`,
);

export interface NewPath {
  id: string;
  title: string;
  startName: string;
  endName: string;
  mode: string;
  visibility: "card_only" | "public";
  pointsJson: string;
  recordedBy: string;
  distanceMeters: number;
  firstLat: number;
  firstLng: number;
  createdAt: string;
}
export const insertPath = (p: NewPath) => void qInsertPath.run(p);
export const getPath = (id: string) => qGetPath.get(id) as PathFullRow | undefined;
export const publicPathsInLatBand = (minLat: number, maxLat: number) =>
  qPathLatBand.all(minLat, maxLat) as PathRow[];

const escapeLike = (s: string) => s.toLowerCase().replace(/[\\%_]/g, (m) => "\\" + m);

export function searchPublicPaths(q?: string, from?: string, to?: string, limit = 100) {
  const where: string[] = ["p.visibility = 'public'"];
  const args: unknown[] = [];
  if (q) {
    const pat = `%${escapeLike(q)}%`;
    where.push(
      `(lower(p.title) LIKE ? ESCAPE '\\' OR lower(p.start_name) LIKE ? ESCAPE '\\' OR lower(p.end_name) LIKE ? ESCAPE '\\')`,
    );
    args.push(pat, pat, pat);
  }
  if (from) {
    where.push(`lower(p.start_name) LIKE ? ESCAPE '\\'`);
    args.push(`%${escapeLike(from)}%`);
  }
  if (to) {
    where.push(`lower(p.end_name) LIKE ? ESCAPE '\\'`);
    args.push(`%${escapeLike(to)}%`);
  }
  const sql = `SELECT ${PATH_COLS} FROM paths p WHERE ${where.join(" AND ")}
               ORDER BY p.created_at DESC, p.rowid DESC LIMIT ?`;
  return db.prepare(sql).all(...args, limit) as PathRow[];
}

/** One vote per handle per path (a new vote replaces the old one); anonymous votes always add. */
export const addVote = db.transaction(
  (pathId: string, worked: boolean, note: string | null, handle: string | null) => {
    if (handle) qDeleteVoteByHandle.run(pathId, handle);
    qInsertVote.run(pathId, worked ? 1 : 0, note, handle, new Date().toISOString());
    return qVoteCounts.get(pathId) as { worked: number; notWorked: number };
  },
);
