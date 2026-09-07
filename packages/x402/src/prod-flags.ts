/** Demo rails that must be off on a public shop host (S3). */
export const SHOP_DEMO_FLAGS = [
  "ALLOW_DEMO_VERIFY",
  "ALLOW_DEMO_ROOT",
  "FIXED_MERKLE_ROOT",
] as const;

function isOn(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  if (v === "" || v === "0" || v === "false") return false;
  return true;
}

/** Fail closed: demo verify / fixed root are forbidden on a public host. */
export function assertNoDemoRails(env: NodeJS.Dict<string>): void {
  for (const key of SHOP_DEMO_FLAGS) {
    if (isOn(env[key])) {
      throw new Error(`prod-guard: ${key} is forbidden on the public host`);
    }
  }
}

export function shouldEnforceStrictProd(env: NodeJS.Dict<string> = process.env): boolean {
  return isOn(env.WARRANT_STRICT_PROD) || env.NODE_ENV === "production";
}
