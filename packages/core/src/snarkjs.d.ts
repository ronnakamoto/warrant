declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Record<string, string | string[]>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: unknown; publicSignals: string[] }>;
    verify(vkey: object, publicSignals: string[], proof: unknown): Promise<boolean>;
  };
}
