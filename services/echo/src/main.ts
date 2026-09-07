import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { FETCH } from "@warrant/core";
import { FileChallengeStore, FileNullifierStore } from "@warrant/x402";
import { createEchoApp } from "./app.js";
import { wireEcho } from "./wiring.js";

const PROD_REQUIRED = [
  "WARRANT_VKEY_PATH",
  "REGISTRY_ADDRESS",
  "BASE_SEPOLIA_RPC",
  "HEDERA_PAY_TO",
] as const;

function isOn(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  if (v === "" || v === "0" || v === "false") return false;
  return true;
}

/** Fail closed in production: verify rails + payTo, not an HCS trio. */
function assertProductionEchoEnv(env: NodeJS.Dict<string>): void {
  for (const key of PROD_REQUIRED) {
    const v = env[key];
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`prod-guard: ${key} is required`);
    }
  }
  const vkey = env.WARRANT_VKEY_PATH!;
  if (!existsSync(vkey) || !statSync(vkey).isFile()) {
    throw new Error(`prod-guard: vkey file missing at WARRANT_VKEY_PATH`);
  }
}

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
  if (process.env.NODE_ENV === "production" || isOn(process.env.WARRANT_STRICT_PROD)) {
    assertProductionEchoEnv(process.env);
  }

  const port = Number(process.env.PORT ?? 8788);
  const facilitatorUrl =
    process.env.BLOCKY402_URL ?? "https://api.testnet.blocky402.com";
  const nullifierPath =
    process.env.WARRANT_NULLIFIER_PATH ?? join(homedir(), ".warrant", "echo-nullifiers.json");
  const challengePath =
    process.env.WARRANT_CHALLENGE_PATH ?? join(dirname(nullifierPath), "echo-challenges.json");

  const shop = wireEcho({
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
  });

  await shop.initialize();
  const app = createEchoApp(shop);

  console.log(
    `echo listening on :${port} minTier=${shop.policy.minTier} freeCalls=${shop.policy.freeCallsPerHuman}`,
  );
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
