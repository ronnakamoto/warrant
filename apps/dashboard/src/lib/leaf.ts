import { poseidon2, poseidon5 } from "poseidon-lite";

/** UTF-8 "warrant/leaf" as field — lockstep with MandateRegistry.DOMAIN_LEAF. */
export const DOMAIN_LEAF = 36946522432971230366786740582n;

/** Poseidon5(DST_leaf, pkX, pkY, tier, epoch) — same as on-chain `_leaf`. */
export function hashLeaf(
  pkX: bigint,
  pkY: bigint,
  tier: bigint,
  epoch: bigint,
): bigint {
  return poseidon5([DOMAIN_LEAF, pkX, pkY, tier, epoch]);
}

/** LeanIMT binary hasher used by @zk-kit/lean-imt (matches Solidity LeanIMT). */
export function leanHash(a: bigint, b: bigint): bigint {
  return poseidon2([a, b]);
}
