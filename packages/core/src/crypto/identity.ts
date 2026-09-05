import { Identity } from "@semaphore-protocol/identity";

export { Identity };

export type MandateSignature = {
  readonly S: bigint;
  readonly R8x: bigint;
  readonly R8y: bigint;
};

/** Semaphore Identity wrap — BabyJubjub keypair + EdDSA-Poseidon. */
export function keygen(privateKey?: string): Identity {
  return new Identity(privateKey);
}

export function sign(id: Identity, message: bigint): MandateSignature {
  const sig = id.signMessage(message);
  return { S: sig.S, R8x: sig.R8[0], R8y: sig.R8[1] };
}

export function verifySignature(
  message: bigint,
  signature: MandateSignature,
  publicKey: readonly [bigint, bigint],
): boolean {
  return Identity.verifySignature(
    message,
    { S: signature.S, R8: [signature.R8x, signature.R8y] },
    [publicKey[0], publicKey[1]],
  );
}
