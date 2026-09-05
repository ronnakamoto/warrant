import { keccak_256 } from "@noble/hashes/sha3";

/** bn254 scalar field — same r as the Groth16 verifier. */
export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export type ChallengeParts = {
  method?: string;
  /** Required — empty path weakens challenge uniqueness. */
  path: string;
  /** Required — empty/missing nonce enables proof replay across requests. */
  nonce: string;
  merkleRoot?: string | bigint;
  amount?: string;
  payTo?: string;
  bodyHash?: string;
};

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt(hex);
}

/**
 * Bind a warrant proof to one x402 challenge.
 * keccak256(method|path|nonce|merkleRoot|amount|payTo|bodyHash) mod r
 *
 * `path` and `nonce` are required so callers cannot accidentally omit the
 * replay-critical fields (empty-string defaults were a review finding).
 */
export function hashChallenge(parts: ChallengeParts): bigint {
  if (typeof parts.path !== "string" || parts.path.length === 0) {
    throw new Error("hashChallenge: path is required");
  }
  if (typeof parts.nonce !== "string" || parts.nonce.length === 0) {
    throw new Error("hashChallenge: nonce is required");
  }
  const method = parts.method ?? "POST";
  const merkleRoot = parts.merkleRoot === undefined ? "" : String(parts.merkleRoot);
  const amount = parts.amount ?? "";
  const payTo = parts.payTo ?? "";
  const bodyHash = parts.bodyHash ?? "";
  const digest = keccak_256(
    utf8(`${method}|${parts.path}|${parts.nonce}|${merkleRoot}|${amount}|${payTo}|${bodyHash}`),
  );
  return bytesToBigInt(digest) % SNARK_SCALAR_FIELD;
}
