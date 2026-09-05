/** Replay + free-tier quota. Demo: in-memory; never part of Groth16. */
export interface INullifierStore {
  /** Replay seal: same proof against the same challenge. */
  takeRequest(nullifier: bigint, requestHash: bigint): Promise<"fresh" | "seen">;
  /**
   * Atomically consume one free call if `used < limit`.
   * Must not interleave check and increment across awaits.
   */
  consumeFree(nullifier: bigint, limit: number): Promise<"granted" | "exhausted">;
}
