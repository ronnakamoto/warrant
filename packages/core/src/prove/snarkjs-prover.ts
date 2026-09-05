import type { WarrantWitness } from "./witness.js";

export type WarrantProof = {
  pi_a: unknown;
  pi_b: unknown;
  pi_c: unknown;
};

export interface IProver {
  prove(witness: WarrantWitness): Promise<WarrantProof>;
}

/** snarkjs Groth16 prover adapter. Stub — WP4. */
export class SnarkjsProver implements IProver {
  async prove(_witness: WarrantWitness): Promise<WarrantProof> {
    throw new Error("not implemented");
  }
}
