import { existsSync, statSync } from "node:fs";

const DEMO_FLAGS = ["ALLOW_DEMO_VERIFY", "ALLOW_DEMO_ROOT", "FIXED_MERKLE_ROOT"] as const;

const REQUIRED = ["WARRANT_VKEY_PATH", "REGISTRY_ADDRESS", "BASE_SEPOLIA_RPC"] as const;

function isOn(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  if (v === "" || v === "0" || v === "false") return false;
  return true;
}

/** Fail-closed host: demo flags and missing verify rails are defects. */
export function assertProductionTranslateEnv(env: NodeJS.Dict<string>): void {
  for (const key of DEMO_FLAGS) {
    if (isOn(env[key])) {
      throw new Error(`prod-guard: ${key} is forbidden on the public host`);
    }
  }
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
  const payTo = env.HEDERA_PAY_TO?.trim();
  const account = env.HEDERA_ACCOUNT_ID?.trim();
  if (payTo && account && payTo === account) {
    throw new Error("prod-guard: HEDERA_PAY_TO must differ from HEDERA_ACCOUNT_ID");
  }
  if (isOn(env.WARRANT_GUEST_SPONSOR)) {
    throw new Error("prod-guard: WARRANT_GUEST_SPONSOR is forbidden on the public host");
  }
}

export function shouldEnforceStrictProd(env: NodeJS.Dict<string> = process.env): boolean {
  return isOn(env.WARRANT_STRICT_PROD) || env.NODE_ENV === "production";
}
