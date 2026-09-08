import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { FETCH } from "@ronnakamoto/warrant-core";
import {
  FileChallengeStore,
  FileNullifierStore,
  shouldEnforceStrictProd,
} from "@ronnakamoto/warrant-x402";
import { createMemoApp } from "./app.js";
import { assertProductionMemoEnv } from "./prod-guard.js";
import { submitMemo } from "./submit.js";
import { wireMemo } from "./wiring.js";

function fixedMerkleRootFromEnv(env: NodeJS.ProcessEnv = process.env): bigint | undefined {
  if (!env.FIXED_MERKLE_ROOT) return undefined;
  if (env.ALLOW_DEMO_ROOT !== "1") {
    throw new Error(
      "FIXED_MERKLE_ROOT is demo-only. Set ALLOW_DEMO_ROOT=1 to acknowledge, or use REGISTRY_ADDRESS + BASE_SEPOLIA_RPC.",
    );
  }
  return BigInt(env.FIXED_MERKLE_ROOT);
}

async function main(): Promise<void> {
  if (shouldEnforceStrictProd()) {
    assertProductionMemoEnv(process.env);
  }

  const port = Number(process.env.PORT ?? 8789);
  const facilitatorUrl =
    process.env.BLOCKY402_URL ?? "https://api.testnet.blocky402.com";
  const nullifierPath =
    process.env.WARRANT_NULLIFIER_PATH ?? join(homedir(), ".warrant", "memo-nullifiers.json");
  const challengePath =
    process.env.WARRANT_CHALLENGE_PATH ?? join(dirname(nullifierPath), "memo-challenges.json");

  const shop = wireMemo({
    facilitatorUrl,
    registryAddress: (process.env.REGISTRY_ADDRESS || undefined) as
      | `0x${string}`
      | undefined,
    baseSepoliaRpc: process.env.BASE_SEPOLIA_RPC,
    fixedMerkleRoot: fixedMerkleRootFromEnv(),
    vkeyPath: process.env.WARRANT_VKEY_PATH,
    nullifiers: new FileNullifierStore(nullifierPath),
    challenges: new FileChallengeStore(challengePath),
    payTo: process.env.HEDERA_PAY_TO ?? process.env.HEDERA_ACCOUNT_ID ?? "0.0.10311260",
    feePayer: process.env.BLOCKY402_FEE_PAYER ?? "0.0.7162784",
    policy: {
      requireScope: FETCH,
      minTier: Number(process.env.WARRANT_MIN_TIER ?? 0),
      freeCallsPerHuman: Number(process.env.WARRANT_FREE_CALLS ?? 0),
    },
    submit: submitMemo,
  });

  await shop.initialize();
  const app = createMemoApp(shop);

  console.log(
    `memo listening on :${port} minTier=${shop.policy.minTier} freeCalls=${shop.policy.freeCallsPerHuman}`,
  );
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
