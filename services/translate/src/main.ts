import { createApp } from "./app.js";
import { fixedMerkleRootFromEnv } from "./demo-root.js";
import { createHcsSinkFromEnv } from "./hcs-hedera.js";
import { initializeWired, wire } from "./wiring.js";

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 8787);
  const facilitatorUrl =
    process.env.BLOCKY402_URL ?? "https://api.testnet.blocky402.com";

  const wired = wire({
    facilitatorUrl,
    registryAddress: (process.env.REGISTRY_ADDRESS || undefined) as
      | `0x${string}`
      | undefined,
    baseSepoliaRpc: process.env.BASE_SEPOLIA_RPC,
    fixedMerkleRoot: fixedMerkleRootFromEnv(),
    vkeyPath: process.env.WARRANT_VKEY_PATH,
    payTo: process.env.HEDERA_ACCOUNT_ID ?? "0.0.10311260",
    feePayer: process.env.BLOCKY402_FEE_PAYER ?? "0.0.7162784",
    hcs: createHcsSinkFromEnv(),
  });

  await initializeWired(wired);
  const app = createApp({ wired });

  console.log(`translate listening on :${port}`);
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
