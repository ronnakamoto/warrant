function isOn(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  if (v === "" || v === "0" || v === "false") return false;
  return true;
}

const REQUIRED = [
  "PROVE_SECRET",
  "BIND_PRIVATE_KEY",
  "REGISTRY_ADDRESS",
  "BASE_SEPOLIA_RPC",
  "GRAPH_WARRANT_QUERY_URL",
] as const;

/** Fail-closed prove worker: live Graph + distinct gas sponsor. */
export function assertProductionProveEnv(env: NodeJS.Dict<string>): void {
  for (const key of REQUIRED) {
    const v = env[key];
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`prod-guard: ${key} is required`);
    }
  }
  const bind = env.BIND_PRIVATE_KEY!.trim().toLowerCase();
  const sponsor = env.GAS_SPONSOR_PRIVATE_KEY?.trim();
  if (!sponsor) {
    throw new Error("prod-guard: GAS_SPONSOR_PRIVATE_KEY is required and must differ from BIND_PRIVATE_KEY");
  }
  if (sponsor.toLowerCase() === bind) {
    throw new Error("prod-guard: GAS_SPONSOR_PRIVATE_KEY must differ from BIND_PRIVATE_KEY");
  }
}

export function shouldEnforceStrictProd(env: NodeJS.Dict<string> = process.env): boolean {
  return isOn(env.WARRANT_STRICT_PROD) || env.NODE_ENV === "production";
}
