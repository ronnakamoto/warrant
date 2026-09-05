export { TRANSLATE, isSubset } from "./domain/scope.js";
export { hashMandate, type Mandate } from "./domain/mandate.js";
export {
  PUBLIC_INPUT_COUNT,
  toArray,
  fromArray,
  type PublicInputs,
  type PublicInputTuple,
} from "./domain/public-inputs.js";
export { hashChallenge } from "./domain/challenge.js";
export { poseidon2, poseidon4, poseidon5 } from "./crypto/poseidon.js";
export { keygen } from "./crypto/identity.js";
export { createGroup } from "./crypto/tree.js";
export { buildWitness, type WarrantWitness } from "./prove/witness.js";
export { SnarkjsProver, type IProver, type WarrantProof } from "./prove/snarkjs-prover.js";
export { SnarkjsVerifier, type IVerifier } from "./prove/snarkjs-verifier.js";

/** Facade verbs — implemented in WP4. */
export function createMandate(..._args: unknown[]): never {
  throw new Error("not implemented");
}
export async function prove(..._args: unknown[]): Promise<never> {
  throw new Error("not implemented");
}
export async function verify(..._args: unknown[]): Promise<never> {
  throw new Error("not implemented");
}
