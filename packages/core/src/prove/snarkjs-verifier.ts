import type { PublicInputs } from "../domain/public-inputs.js";
import type { WarrantProof } from "./snarkjs-prover.js";

export interface IVerifier {
  verify(proof: WarrantProof, publics: PublicInputs): Promise<boolean>;
}

/** snarkjs Groth16 verifier adapter. Stub — WP4. */
export class SnarkjsVerifier implements IVerifier {
  async verify(_proof: WarrantProof, _publics: PublicInputs): Promise<boolean> {
    throw new Error("not implemented");
  }
}
