import { groth16 } from "snarkjs";
import { stringifyWitness, type WarrantWitness } from "./witness.js";

export type WarrantProof = {
  pi_a: unknown;
  pi_b: unknown;
  pi_c: unknown;
  protocol?: string;
  curve?: string;
};

export interface IProver {
  prove(witness: WarrantWitness): Promise<WarrantProof>;
}

/** snarkjs Groth16 prover adapter. */
export class SnarkjsProver implements IProver {
  constructor(
    private readonly wasmPath: string,
    private readonly zkeyPath: string,
  ) {}

  async prove(witness: WarrantWitness): Promise<WarrantProof> {
    const { proof } = await groth16.fullProve(
      stringifyWitness(witness),
      this.wasmPath,
      this.zkeyPath,
    );
    return proof as WarrantProof;
  }
}
