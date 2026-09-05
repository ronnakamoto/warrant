/** Immutable mandate; hashMandate via Poseidon(5). Stub — WP4. */
export type Mandate = {
  readonly childPkX: bigint;
  readonly childPkY: bigint;
  readonly scope: bigint;
  readonly budgetCap: bigint;
  readonly expiry: bigint;
};

export function hashMandate(_m: Mandate): bigint {
  throw new Error("not implemented");
}
