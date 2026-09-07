import type { INullifierStore } from "@warrant/core";

/** In-memory nullifier + free-quota store for demos and tests. */
export class MemoryNullifierStore implements INullifierStore {
  readonly #seen = new Set<string>();
  readonly #free = new Map<string, number>();

  async takeRequest(nullifier: bigint, requestHash: bigint): Promise<"fresh" | "seen"> {
    const key = `${nullifier}:${requestHash}`;
    if (this.#seen.has(key)) return "seen";
    this.#seen.add(key);
    return "fresh";
  }

  async consumeFree(nullifier: bigint, limit: number): Promise<"granted" | "exhausted"> {
    const key = String(nullifier);
    const used = this.#free.get(key) ?? 0;
    if (used >= limit) return "exhausted";
    this.#free.set(key, used + 1);
    return "granted";
  }
}
