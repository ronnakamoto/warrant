import { readFileSync } from "node:fs";
import { groth16 } from "snarkjs";
import { toArray, type PublicInputs } from "../domain/public-inputs.js";
import type { WarrantProof } from "./snarkjs-prover.js";

export interface IVerifier {
  verify(proof: WarrantProof, publics: PublicInputs): Promise<boolean>;
}

/** snarkjs Groth16 verifier adapter. */
export class SnarkjsVerifier implements IVerifier {
  constructor(private readonly vkey: object) {}

  static fromPath(vkeyPath: string): SnarkjsVerifier {
    return new SnarkjsVerifier(JSON.parse(readFileSync(vkeyPath, "utf8")) as object);
  }

  async verify(proof: WarrantProof, publics: PublicInputs): Promise<boolean> {
    const signals = toArray(publics).map((x) => x.toString());
    return groth16.verify(this.vkey, signals, proof);
  }
}
