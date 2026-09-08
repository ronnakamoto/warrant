import { existsSync, statSync } from "node:fs";
import { assertNoDemoRails } from "@ronnakamoto/warrant-x402";

const REQUIRED = [
  "WARRANT_VKEY_PATH",
  "REGISTRY_ADDRESS",
  "BASE_SEPOLIA_RPC",
  "HEDERA_PAY_TO",
  "HEDERA_MEMO_TOPIC_ID",
  "HEDERA_ACCOUNT_ID",
  "HEDERA_PRIVATE_KEY",
  "WARRANT_NULLIFIER_PATH",
  "WARRANT_CHALLENGE_PATH",
] as const;

/** Fail closed: demo rails + verify rails + memo topic + operator key. No HCS audit trio. */
export function assertProductionMemoEnv(env: NodeJS.Dict<string>): void {
  assertNoDemoRails(env);
  for (const key of REQUIRED) {
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
