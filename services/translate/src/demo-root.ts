/**
 * FIXED_MERKLE_ROOT skips on-chain membership — demo/tests only.
 * Requires explicit ALLOW_DEMO_ROOT=1.
 *
 * Pair with ALLOW_DEMO_VERIFY=1 only for local smoke without a vkey
 * (accepts any proof bytes). Production: WARRANT_VKEY_PATH + REGISTRY_ADDRESS.
 */
export function fixedMerkleRootFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): bigint | undefined {
  if (!env.FIXED_MERKLE_ROOT) return undefined;
  if (env.ALLOW_DEMO_ROOT !== "1") {
    throw new Error(
      "FIXED_MERKLE_ROOT is demo-only. Set ALLOW_DEMO_ROOT=1 to acknowledge, or use REGISTRY_ADDRESS + BASE_SEPOLIA_RPC.",
    );
  }
  return BigInt(env.FIXED_MERKLE_ROOT);
}
