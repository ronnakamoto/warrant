import { keccak256, toBytes } from "viem";

/** bn254 scalar field — same r as the Groth16 verifier. */
export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Bind a warrant proof to one x402 challenge.
 * Canonical string, then keccak256, then reduce into the snark field.
 * Changing nonce, merkleRoot, method, path, amount, or payTo changes the public requestHash.
 */
export function hashChallenge(parts) {
  const method = parts.method ?? "POST";
  const path = parts.path ?? "";
  const nonce = parts.nonce ?? "";
  const merkleRoot = parts.merkleRoot ?? "";
  const amount = parts.amount ?? "";
  const payTo = parts.payTo ?? "";
  const bodyHash = parts.bodyHash ?? "";
  const digest = keccak256(
    toBytes(`${method}|${path}|${nonce}|${merkleRoot}|${amount}|${payTo}|${bodyHash}`),
  );
  return BigInt(digest) % SNARK_SCALAR_FIELD;
}

export function challengeFromPaymentRequired(paymentRequired, extra = {}) {
  const info = paymentRequired?.extensions?.warrant?.info ?? {};
  const accept = paymentRequired?.accepts?.[0] ?? {};
  return {
    method: extra.method ?? "POST",
    path: extra.path ?? "/v1/translate",
    nonce: String(info.nonce ?? ""),
    merkleRoot: String(info.merkleRoot ?? ""),
    amount: String(accept.amount ?? ""),
    payTo: String(accept.payTo ?? ""),
    bodyHash: extra.bodyHash ?? "",
  };
}
