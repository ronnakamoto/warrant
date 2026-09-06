import { homedir } from "node:os";
import { join } from "node:path";
import { TRANSLATE } from "@warrant/core";
import { createApp } from "./app.js";
import { fixedMerkleRootFromEnv } from "./demo-root.js";
import { createHcsSinkFromEnv } from "./hcs-hedera.js";
import { FileNullifierStore } from "./nullifiers-file.js";
import { initializeWired, wire } from "./wiring.js";
import { assertProductionTranslateEnv, shouldEnforceStrictProd } from "./prod-guard.js";

async function main(): Promise<void> {
  if (shouldEnforceStrictProd()) {
    assertProductionTranslateEnv(process.env);
  }

  const ports = [...new Set(
    [Number(process.env.PORT ?? 8787), 8787].filter((n) => Number.isFinite(n) && n > 0),
  )];
  const facilitatorUrl =
    process.env.BLOCKY402_URL ?? "https://api.testnet.blocky402.com";

  const nullifierPath =
    process.env.WARRANT_NULLIFIER_PATH ?? join(homedir(), ".warrant", "nullifiers.json");

  const wired = wire({
    facilitatorUrl,
    registryAddress: (process.env.REGISTRY_ADDRESS || undefined) as
      | `0x${string}`
      | undefined,
    baseSepoliaRpc: process.env.BASE_SEPOLIA_RPC,
    fixedMerkleRoot: fixedMerkleRootFromEnv(),
    vkeyPath: process.env.WARRANT_VKEY_PATH,
    nullifiers: new FileNullifierStore(nullifierPath),
    payTo: process.env.HEDERA_PAY_TO ?? process.env.HEDERA_ACCOUNT_ID ?? "0.0.10311260",
    feePayer: process.env.BLOCKY402_FEE_PAYER ?? "0.0.7162784",
    hcs: createHcsSinkFromEnv(),
    policy: {
      requireScope: TRANSLATE,
      minTier: Number(process.env.WARRANT_MIN_TIER ?? 0),
      freeCallsPerHuman: Number(process.env.WARRANT_FREE_CALLS ?? 3),
    },
  });

  await initializeWired(wired);
  const app = createApp({ wired });

  console.log(
    `translate listening on :${ports.join(",")} minTier=${wired.policy.minTier} freeCalls=${wired.policy.freeCallsPerHuman}`,
  );
  const { serve } = await import("@hono/node-server");
  for (const port of ports) serve({ fetch: app.fetch, port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
