/** Live forest MandateRegistry on Base Sepolia. See deployments/base-sepolia.json. */
export const LIVE_REGISTRY_ADDRESS =
  "0x8704606Bde5E257dC009cCe55214Df70975f89c5" as const;

/** Pre-forest registry. A stale Vercel env must not win. */
export const RETIRED_REGISTRY_ADDRESS =
  "0x103749E5529C3Ce31A1EB8e0657280AaE7e9dA89" as const;

export function defaultRegistryAddress(
  fromEnv = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
): string {
  if (!fromEnv) return LIVE_REGISTRY_ADDRESS;
  if (fromEnv.toLowerCase() === RETIRED_REGISTRY_ADDRESS.toLowerCase()) {
    return LIVE_REGISTRY_ADDRESS;
  }
  return fromEnv;
}
