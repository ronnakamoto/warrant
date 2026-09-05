/** { requireScope, minTier, freeCallsPerHuman } — data, not I/O. */
export type WarrantPolicy = {
  requireScope: bigint;
  minTier: number;
  freeCallsPerHuman: number;
};
