/** Exactly 8 public input slots. Adding a field is a type error. */
export const PUBLIC_INPUT_COUNT = 8 as const;

export type PublicInputTuple = readonly [
  merkleRoot: bigint,
  contextHash: bigint,
  nullifier: bigint,
  effectiveScope: bigint,
  effectiveBudgetCap: bigint,
  minExpiry: bigint,
  tier: bigint,
  requestHash: bigint,
];

export type PublicInputs = {
  readonly merkleRoot: bigint;
  readonly contextHash: bigint;
  readonly nullifier: bigint;
  readonly effectiveScope: bigint;
  readonly effectiveBudgetCap: bigint;
  readonly minExpiry: bigint;
  readonly tier: bigint;
  readonly requestHash: bigint;
};

export function toArray(p: PublicInputs): PublicInputTuple {
  const arr: PublicInputTuple = [
    p.merkleRoot,
    p.contextHash,
    p.nullifier,
    p.effectiveScope,
    p.effectiveBudgetCap,
    p.minExpiry,
    p.tier,
    p.requestHash,
  ];
  if (arr.length !== PUBLIC_INPUT_COUNT) {
    throw new Error(`public inputs must have length ${PUBLIC_INPUT_COUNT}`);
  }
  return arr;
}

export function fromArray(arr: readonly bigint[]): PublicInputs {
  if (arr.length !== PUBLIC_INPUT_COUNT) {
    throw new Error(`expected ${PUBLIC_INPUT_COUNT} public inputs, got ${arr.length}`);
  }
  return {
    merkleRoot: arr[0]!,
    contextHash: arr[1]!,
    nullifier: arr[2]!,
    effectiveScope: arr[3]!,
    effectiveBudgetCap: arr[4]!,
    minExpiry: arr[5]!,
    tier: arr[6]!,
    requestHash: arr[7]!,
  };
}
