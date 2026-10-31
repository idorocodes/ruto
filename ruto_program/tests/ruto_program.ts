import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import * as fs from "node:fs";
import type { RutoProgram } from "../target/types/ruto_program";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

// Loaded from the IDL that `anchor build` writes, so the test does not depend on
// how a given Anchor version names its workspace entries.
const idl = JSON.parse(
  fs.readFileSync(
    new URL("../target/idl/ruto_program.json", import.meta.url),
    "utf8"
  )
);
const program = new Program<RutoProgram>(idl, provider);

const authority = provider.wallet.publicKey;
const stranger = Keypair.generate(); // never the program authority

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const [configPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("config")],
  program.programId
);

const profilePda = (handle: string): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), Buffer.from(handle)],
    program.programId
  )[0];

async function fundAccount(account: PublicKey, sol = 1) {
  const signature = await provider.connection.requestAirdrop(
    account,
    sol * anchor.web3.LAMPORTS_PER_SOL)
  
  await provider.connection.confirmTransaction(signature, "confirmed");
}
const cardPda = (recipientProfile: PublicKey, index: number): PublicKey => {
  const idx = Buffer.alloc(4);
  idx.writeUInt32LE(index);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("card"), recipientProfile.toBuffer(), idx],
    program.programId
  )[0];
};

const bytes32 = (fill: number): number[] => Array(32).fill(fill);

/** Passes only if the promise rejects; optionally checks the error text or logs. */
async function expectFail(promise: Promise<unknown>, needle?: string) {
  try {
    await promise;
  } catch (err: any) {
    let logs: string[] = err?.logs ?? [];

    if (!logs.length && typeof err?.getLogs === "function") {
      logs = await err.getLogs(provider.connection);
    }

    const details = [
      err?.message,
      err?.toString(),
      ...logs,
    ].filter(Boolean).join("\n");

    if (needle) {
      assert.include(details, needle, `Actual transaction error:\n${details}`);
    }

    return;
  }

  assert.fail("expected the transaction to fail, but it succeeded");
}

const makeProfile = async (handle: string, avatarId = 1, hashFill = 7) =>
  program.methods
    .createProfile(handle, avatarId, bytes32(hashFill))
    .accounts({
      config: configPda,
      authority,
      profile: profilePda(handle),
      systemProgram: SystemProgram.programId,
    } as any)
    .rpc();

const inboxCount = async (handle: string): Promise<number> =>
  (await program.account.profile.fetch(profilePda(handle))).inboxCount;

/** Sends a route card and returns the card's address. */
async function sendRoute(
  from: string,
  to: string,
  hash: number[],
  signer?: Keypair
): Promise<PublicKey> {
  const card = cardPda(profilePda(to), await inboxCount(to));
  const builder = program.methods.sendRouteCard(hash).accounts({
    config: configPda,
    authority: signer ? signer.publicKey : authority,
    senderProfile: profilePda(from),
    recipientProfile: profilePda(to),
    card,
    systemProgram: SystemProgram.programId,
  } as any);
  await (signer ? builder.signers([signer]).rpc() : builder.rpc());
  return card;
}

/** Sends a profile card (sharing `shared`) and returns the card's address. */
async function sendProfile(
  from: string,
  to: string,
  shared: string
): Promise<PublicKey> {
  const card = cardPda(profilePda(to), await inboxCount(to));
  await program.methods
    .sendProfileCard()
    .accounts({
      config: configPda,
      authority,
      senderProfile: profilePda(from),
      recipientProfile: profilePda(to),
      sharedProfile: profilePda(shared),
      card,
      systemProgram: SystemProgram.programId,
    } as any)
    .rpc();
  return card;
}

async function respond(
  card: PublicKey,
  recipientHandle: string,
  accept: boolean,
  signer?: Keypair
) {
  const builder = program.methods.respondCard(accept).accounts({
    config: configPda,
    authority: signer ? signer.publicKey : authority,
    recipientProfile: profilePda(recipientHandle),
    card,
  } as any);
  return signer ? builder.signers([signer]).rpc() : builder.rpc();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ruto_program", () => {
  describe("config", () => {
    it("initializes once and stores the authority", async () => {
      await program.methods
        .initializeConfig()
        .accounts({
          config: configPda,
          authority,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      const config = await program.account.config.fetch(configPda);
      assert.equal(config.authority.toBase58(), authority.toBase58());
    });

    it("cannot be initialized a second time", async () => {
      await expectFail(
        program.methods
          .initializeConfig()
          .accounts({
            config: configPda,
            authority,
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc()
      );
    });
  });

  describe("create_profile", () => {
    it("creates a profile with zeroed counters", async () => {
      await makeProfile("alice", 3, 11);

      const p = await program.account.profile.fetch(profilePda("alice"));
      assert.equal(p.handle, "alice");
      assert.equal(p.avatarId, 3);
      assert.deepEqual(Array.from(p.dataHash), bytes32(11));
      assert.equal(p.inboxCount, 0);
      assert.equal(p.sentCount, 0);
      assert.isAbove(p.createdAt.toNumber(), 0);
    });

    it("rejects a handle that is already taken", async () => {
      await expectFail(makeProfile("alice"));
    });

    it("rejects uppercase, too-short, too-long and odd characters", async () => {
      await expectFail(makeProfile("Alice"), "InvalidHandle");
      await expectFail(makeProfile("ab"), "InvalidHandle");
      await expectFail(makeProfile("a".repeat(21)), "InvalidHandle");
      await expectFail(makeProfile("bad-name"), "InvalidHandle");
      await expectFail(makeProfile("has space"), "InvalidHandle");
    });

    it("rejects a signer that is not the authority", async () => {
     await  fundAccount(stranger.publicKey)
      await expectFail(
        program.methods
          .createProfile("mallory", 1, bytes32(1))
          .accounts({
            config: configPda,
            authority: stranger.publicKey,
            profile: profilePda("mallory"),
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([stranger])
          .rpc(),
        "Unauthorized"
      );
    });
  });

  describe("send_route_card", () => {
    before(async () => {
      await makeProfile("bob");
      await makeProfile("carol");
    });

    it("stores the hash and bumps both counters", async () => {
      const card = await sendRoute("alice", "bob", bytes32(9));

      const c = await program.account.card.fetch(card);
      assert.equal(c.sender.toBase58(), profilePda("alice").toBase58());
      assert.equal(c.recipient.toBase58(), profilePda("bob").toBase58());
      assert.property(c.kind, "route");
      assert.property(c.status, "pending");
      assert.deepEqual(Array.from(c.routeHash), bytes32(9));
      assert.equal(c.sharedProfile.toBase58(), PublicKey.default.toBase58());
      assert.equal(c.index, 0);
      assert.isAbove(c.createdAt.toNumber(), 0);
      assert.equal(c.resolvedAt.toNumber(), 0);

      assert.equal(await inboxCount("bob"), 1);
      const alice = await program.account.profile.fetch(profilePda("alice"));
      assert.equal(alice.sentCount, 1);
    });

    it("uses the next index for a second card", async () => {
      const card = await sendRoute("alice", "bob", bytes32(10));
      assert.equal(card.toBase58(), cardPda(profilePda("bob"), 1).toBase58());

      const c = await program.account.card.fetch(card);
      assert.equal(c.index, 1);
      assert.deepEqual(Array.from(c.routeHash), bytes32(10));
      assert.equal(await inboxCount("bob"), 2);
    });

    it("rejects sending a card to yourself", async () => {
      await expectFail(sendRoute("alice", "alice", bytes32(5)));
      assert.equal(await inboxCount("alice"), 0);
    });

    it("rejects a signer that is not the authority", async () => {

     await  fundAccount(stranger.publicKey)
      await expectFail(
        sendRoute("alice", "bob", bytes32(6), stranger),
        "Unauthorized"
      );
      assert.equal(await inboxCount("bob"), 2);
    });
  });

  describe("send_profile_card", () => {
    it("shares another profile with the recipient", async () => {
      const card = await sendProfile("alice", "bob", "carol");

      const c = await program.account.card.fetch(card);
      assert.property(c.kind, "profile");
      assert.property(c.status, "pending");
      assert.equal(c.sharedProfile.toBase58(), profilePda("carol").toBase58());
      assert.deepEqual(Array.from(c.routeHash), bytes32(0));
      assert.equal(c.index, 2);
      assert.equal(await inboxCount("bob"), 3);
    });

    it("lets a sender share their own profile", async () => {
      const card = await sendProfile("alice", "bob", "alice");

      const c = await program.account.card.fetch(card);
      assert.equal(c.sharedProfile.toBase58(), profilePda("alice").toBase58());
      assert.equal(c.index, 3);
    });

    it("rejects sharing the recipient's own profile", async () => {
      await expectFail(sendProfile("alice", "bob", "bob"), "InvalidSharedProfile");
      assert.equal(await inboxCount("bob"), 4);
    });
  });

  describe("respond_card", () => {
    it("accepts a pending card and records when", async () => {
      const card = cardPda(profilePda("bob"), 0);
      await respond(card, "bob", true);

      const c = await program.account.card.fetch(card);
      assert.property(c.status, "accepted");
      assert.isAbove(c.resolvedAt.toNumber(), 0);
    });

    it("cannot resolve the same card twice", async () => {
      const card = cardPda(profilePda("bob"), 0);
      await expectFail(respond(card, "bob", false), "AlreadyResolved");

      const c = await program.account.card.fetch(card);
      assert.property(c.status, "accepted");
    });

    it("declines a pending card", async () => {
      const card = cardPda(profilePda("bob"), 1);
      await respond(card, "bob", false);

      const c = await program.account.card.fetch(card);
      assert.property(c.status, "declined");
      assert.isAbove(c.resolvedAt.toNumber(), 0);
    });

    it("rejects a signer that is not the authority", async () => {
      await fundAccount(stranger.publicKey)
      const card = cardPda(profilePda("bob"), 2);
      await expectFail(respond(card, "bob", true, stranger), "Unauthorized");

      const c = await program.account.card.fetch(card);
      assert.property(c.status, "pending");
    });

    it("rejects the wrong recipient profile for a card", async () => {
      const card = cardPda(profilePda("bob"), 2);
      await expectFail(respond(card, "carol", true), "ConstraintSeeds");

      const c = await program.account.card.fetch(card);
      assert.property(c.status, "pending");
    });
  });
});
