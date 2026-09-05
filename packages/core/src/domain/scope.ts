/** uint64 capability bitmask. Named bits are powers of two. */
export const TRANSLATE = 1n;
export const FETCH = 2n;
export const TRADE = 4n;

export const UINT64_MAX = (1n << 64n) - 1n;

export function assertUint64(value: bigint, name: string): void {
  if (value < 0n || value > UINT64_MAX) {
    throw new Error(`${name} must fit in uint64`);
  }
}

/** Child bits must be a subset of parent bits (circuit ScopeSubset). */
export function isSubset(parent: bigint, child: bigint): boolean {
  assertUint64(parent, "parent");
  assertUint64(child, "child");
  return (child & parent) === child;
}
