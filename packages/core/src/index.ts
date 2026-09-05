export { TRANSLATE, FETCH, TRADE, UINT64_MAX, isSubset, assertUint64 } from "./domain/scope.js";
export {
  hashMandate,
  createMandate,
  type Mandate,
  type SignedMandate,
  type CreateMandateArgs,
  type MandateSignature,
} from "./domain/mandate.js";
export {
  DOMAIN,
  tagCommitment,
  hashLeaf,
  hashNullifier,
  hashMandateFields,
} from "./domain/hashes.js";
export {
  PUBLIC_INPUT_COUNT,
  PUBLIC,
  toArray,
  fromArray,
  publicsFromWitness,
  type PublicInputs,
  type PublicInputTuple,
} from "./domain/public-inputs.js";
export { hashChallenge, SNARK_SCALAR_FIELD, type ChallengeParts } from "./domain/challenge.js";
export { poseidon2, poseidon3, poseidon4, poseidon5, poseidon10 } from "./crypto/poseidon.js";
export { keygen, sign, verifySignature, Identity } from "./crypto/identity.js";
export {
  createGroup,
  padSiblings,
  membershipProof,
  MAX_MERKLE_DEPTH,
  Group,
  type IRootChecker,
  type MembershipProof,
} from "./crypto/tree.js";
export {
  buildWitness,
  stringifyWitness,
  DEPTH,
  type WarrantWitness,
  type BuildWitnessArgs,
} from "./prove/witness.js";
export { SnarkjsProver, type IProver, type WarrantProof } from "./prove/snarkjs-prover.js";
export { SnarkjsVerifier, type IVerifier } from "./prove/snarkjs-verifier.js";
export type { INullifierStore } from "./ports/nullifier-store.js";

import type { IProver, WarrantProof } from "./prove/snarkjs-prover.js";
import type { IVerifier } from "./prove/snarkjs-verifier.js";
import { buildWitness, type BuildWitnessArgs } from "./prove/witness.js";
import type { PublicInputs } from "./domain/public-inputs.js";

/** Facade: assemble D=4 witness (on-curve dummy hops) and prove. */
export async function prove(
  args: BuildWitnessArgs,
  prover: IProver,
): Promise<{ proof: WarrantProof; publics: PublicInputs }> {
  const { witness, publics } = buildWitness(args);
  const proof = await prover.prove(witness);
  return { proof, publics };
}

/** Facade: verify Groth16 against the frozen 8-tuple. */
export async function verify(
  proof: WarrantProof,
  publics: PublicInputs,
  verifier: IVerifier,
): Promise<boolean> {
  return verifier.verify(proof, publics);
}
