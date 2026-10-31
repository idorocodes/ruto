import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";

/* -------------------------------- errors -------------------------------- */

export type ChainErrorKind =
  | "chain_error"
  | "handle_taken"
  | "sender_not_found"
  | "recipient_not_found";

export class ChainError extends Error {
  constructor(
    public kind: ChainErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ChainError";
  }
}

/* ------------------------------- helpers -------------------------------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Short, single-line message that is safe to log and return (never contains keys). */
const publicMsg = (e: any): string =>
  String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 300);

/** Message + program logs, used only for matching. */
const errText = (e: any): string =>
  [
    e?.message,
    e?.transactionMessage,
    ...(Array.isArray(e?.logs) ? e.logs : []),
    ...(Array.isArray(e?.transactionLogs) ? e.transactionLogs : []),
  ]
    .filter(Boolean)
    .join(" | ");

const TRANSIENT =
  /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|\b429\b|Too Many Requests|\b50[234]\b|Service Unavailable|timed out|timeout|Blockhash not found|block height exceeded|node is behind/i;
const PROGRAM_ERROR =
  /custom program error|AnchorError|Error Code:|already in use|Instruction #\d+ Failed/i;

/** Retry exactly once, and only for transient RPC/network failures. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof ChainError) throw e;
    const t = errText(e);
    if (PROGRAM_ERROR.test(t) || !TRANSIENT.test(t)) throw e;
    await sleep(600);
    return await fn();
  }
}

/** Run a chain operation; anything that is not already a ChainError becomes chain_error. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof ChainError) throw e;
    const msg = publicMsg(e);
    console.error("[chain]", msg);
    throw new ChainError("chain_error", msg);
  }
}

/** Per-key async mutex: tasks with the same key run strictly one after another. */
const locks = new Map<string, Promise<unknown>>();
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  locks.set(key, tail);
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
}

/* ------------------------------ bootstrap ------------------------------- */

interface Ctx {
  connection: Connection;
  keypair: Keypair;
  program: Program<Idl>;
  programId: PublicKey;
  configPda: PublicKey;
  cluster: string;
}
let ctx: Ctx | undefined;
const need = (): Ctx => {
  if (!ctx) throw new Error("chain layer not initialised");
  return ctx;
};
const acc = (): any => need().program.account as any;
const methods = (): any => need().program.methods as any;

function detectCluster(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("devnet")) return "devnet";
  if (u.includes("testnet")) return "testnet";
  if (u.includes("mainnet")) return "mainnet-beta";
  if (u.includes("localhost") || u.includes("127.0.0.1")) return "localnet";
  return "custom";
}

function loadKeypair(): Keypair {
  const raw = process.env.AUTHORITY_SECRET_KEY?.trim();
  const file = process.env.AUTHORITY_KEYPAIR_PATH?.trim();
  let parsed: unknown;

  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Do not echo the parser message: it may contain a fragment of the secret.
      throw new Error(
        "AUTHORITY_SECRET_KEY is not valid JSON (expected an array of 64 numbers).",
      );
    }
  } else if (file) {
    const p = path.resolve(file.replace(/^~(?=$|\/|\\)/, os.homedir()));
    try {
      parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      throw new Error(
        `Could not read a JSON keypair from AUTHORITY_KEYPAIR_PATH (${p}).`,
      );
    }
  } else {
    throw new Error(
      "No authority keypair configured. Set AUTHORITY_SECRET_KEY (JSON array of 64 numbers) or AUTHORITY_KEYPAIR_PATH.",
    );
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    !parsed.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  ) {
    throw new Error("The authority keypair must be a JSON array of 64 bytes (numbers 0-255).");
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
}

function loadIdl(): Idl {
  const p = process.env.IDL_PATH
    ? path.resolve(process.env.IDL_PATH)
    : path.resolve(__dirname, "../idl/ruto_program.json");
  let idl: any;
  try {
    idl = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    throw new Error(`Could not read the program IDL at ${p}. Place ruto_program.json there.`);
  }
  if (!idl?.address) {
    throw new Error(`The IDL at ${p} has no "address" field, so the program id is unknown.`);
  }
  return idl as Idl;
}

export async function initChain(): Promise<void> {
  const keypair = loadKeypair();
  const idl = loadIdl();
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const cluster = detectCluster(rpcUrl);

  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(keypair), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new Program(idl, provider);
  const programId = program.programId;
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);

  ctx = { connection, keypair, program, programId, configPda, cluster };

  let config: any;
  try {
    config = await withRetry(() => acc().config.fetch(configPda, "confirmed"));
  } catch (e: any) {
    ctx = undefined;
    throw new Error(
      `Could not fetch the Config account (${configPda.toBase58()}) of program ${programId.toBase58()} on ${cluster}: ${publicMsg(e)}. ` +
        `Is the program initialised on this cluster, and is SOLANA_RPC_URL correct?`,
    );
  }

  if (!config.authority.equals(keypair.publicKey)) {
    ctx = undefined;
    throw new Error(
      `Refusing to start: on-chain config.authority is ${config.authority.toBase58()} ` +
        `but the loaded keypair is ${keypair.publicKey.toBase58()}. ` +
        `Provide the authority keypair in AUTHORITY_SECRET_KEY or AUTHORITY_KEYPAIR_PATH.`,
    );
  }
}

/* --------------------------------- PDAs --------------------------------- */

export function profilePda(handle: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), Buffer.from(handle, "utf8")],
    need().programId,
  )[0];
}

export function cardPda(recipientProfile: PublicKey, index: number): PublicKey {
  const idx = Buffer.alloc(4);
  idx.writeUInt32LE(index, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("card"), recipientProfile.toBuffer(), idx],
    need().programId,
  )[0];
}

/* ------------------------------- read info ------------------------------ */

export function info() {
  const c = need();
  return {
    programId: c.programId.toBase58(),
    authority: c.keypair.publicKey.toBase58(),
    cluster: c.cluster,
  };
}

export const authorityAddress = () => need().keypair.publicKey.toBase58();

export function health() {
  return guarded(async () => {
    const c = need();
    const lamports = await withRetry(() =>
      c.connection.getBalance(c.keypair.publicKey, "confirmed"),
    );
    const sol = lamports / LAMPORTS_PER_SOL;
    return {
      ...info(),
      authorityBalanceSol: Number(sol.toFixed(4)),
      lowBalance: sol < 0.5,
    };
  });
}

/* ------------------------------ instructions ---------------------------- */

export function createProfile(handle: string, avatarId: number, dataHash: Buffer) {
  return guarded(async () => {
    const c = need();
    try {
      const signature: string = await withRetry(() =>
        methods()
          .createProfile(handle, avatarId, Array.from(dataHash))
          .accounts({
            config: c.configPda,
            authority: c.keypair.publicKey,
            profile: profilePda(handle),
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc({ commitment: "confirmed" }),
      );
      return signature;
    } catch (e: any) {
      if (/already in use/i.test(errText(e))) {
        throw new ChainError("handle_taken", "That handle already exists on-chain.");
      }
      throw e;
    }
  });
}

/**
 * Sends a route card. The card PDA index is the recipient's current on-chain
 * inboxCount, read right before sending, and sends to the same recipient are
 * serialised so two requests can never target the same index.
 */
export function sendRouteCard(fromHandle: string, toHandle: string, routeHash: Buffer) {
  return withLock(`inbox:${toHandle}`, () =>
    guarded(async () => {
      const c = need();
      return withRetry(async () => {
        const senderPda = profilePda(fromHandle);
        const recipientPda = profilePda(toHandle);
        const [sender, recipient] = await Promise.all([
          acc().profile.fetchNullable(senderPda, "confirmed"),
          acc().profile.fetchNullable(recipientPda, "confirmed"),
        ]);
        if (!sender) throw new ChainError("sender_not_found", "Sender profile not found on-chain.");
        if (!recipient)
          throw new ChainError("recipient_not_found", "Recipient profile not found on-chain.");

        const index = Number(recipient.inboxCount.toString());
        const pda = cardPda(recipientPda, index);

        const signature: string = await methods()
          .sendRouteCard(Array.from(routeHash))
          .accounts({
            config: c.configPda,
            authority: c.keypair.publicKey,
            senderProfile: senderPda,
            recipientProfile: recipientPda,
            card: pda,
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc({ commitment: "confirmed" });

        return { signature, cardPda: pda.toBase58(), index };
      });
    }),
  );
}

export function respondCard(recipientHandle: string, cardPdaAddress: string, accept: boolean) {
  return guarded(async () => {
    const c = need();
    const signature: string = await withRetry(() =>
      methods()
        .respondCard(accept)
        .accounts({
          config: c.configPda,
          authority: c.keypair.publicKey,
          recipientProfile: profilePda(recipientHandle),
          card: new PublicKey(cardPdaAddress),
        } as any)
        .rpc({ commitment: "confirmed" }),
    );
    return signature;
  });
}

/** The routeHash stored in the on-chain Card account as lowercase hex, or null if it does not exist. */
export function fetchCardRouteHashHex(cardPdaAddress: string) {
  return guarded(async () => {
    const card = await withRetry(() =>
      acc().card.fetchNullable(new PublicKey(cardPdaAddress), "confirmed"),
    );
    if (!card) return null;
    return Buffer.from(card.routeHash as number[]).toString("hex");
  });
}
