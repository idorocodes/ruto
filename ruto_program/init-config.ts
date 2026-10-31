// One-off: creates the Config account that stores the authority for ruto_program.
// Run it right after deploying. The wallet that signs here becomes the ONLY authority
// that can create profiles and send or resolve cards, so use the same keypair the
// server will hold.
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "target/idl/ruto_program.json"),
      "utf8"
    )
  );
  const program: any = new Program(idl, provider);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  console.log("cluster  :", provider.connection.rpcEndpoint);
  console.log("program  :", program.programId.toBase58());
  console.log("authority:", provider.wallet.publicKey.toBase58());
  console.log("config   :", configPda.toBase58());

  if (await provider.connection.getAccountInfo(configPda)) {
    const config = await program.account.config.fetch(configPda);
    console.log("Config already exists. Authority is", config.authority.toBase58());
    return;
  }

  const sig = await program.methods
    .initializeConfig()
    .accounts({
      config: configPda,
      authority: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .rpc();

  console.log("Initialized. tx:", sig);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
