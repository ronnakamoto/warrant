import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { INullifierStore } from "@warrant/core";

type FileShape = {
  seen: string[];
  free: Record<string, number>;
};

/**
 * Durable nullifier + free-quota store (JSON file).
 * Survives translate restarts; fine for single-process demo/staging.
 */
export class FileNullifierStore implements INullifierStore {
  readonly #path: string;
  #seen: Set<string>;
  #free: Map<string, number>;

  constructor(path: string) {
    this.#path = path;
    const loaded = load(path);
    this.#seen = new Set(loaded.seen);
    this.#free = new Map(Object.entries(loaded.free));
  }

  async takeRequest(nullifier: bigint, requestHash: bigint): Promise<"fresh" | "seen"> {
    const key = `${nullifier}:${requestHash}`;
    if (this.#seen.has(key)) return "seen";
    this.#seen.add(key);
    this.#persist();
    return "fresh";
  }

  async consumeFree(nullifier: bigint, limit: number): Promise<"granted" | "exhausted"> {
    const key = String(nullifier);
    const used = this.#free.get(key) ?? 0;
    if (used >= limit) return "exhausted";
    this.#free.set(key, used + 1);
    this.#persist();
    return "granted";
  }

  #persist(): void {
    const dir = dirname(this.#path);
    mkdirSync(dir, { recursive: true });
    const body: FileShape = {
      seen: [...this.#seen],
      free: Object.fromEntries(this.#free),
    };
    const tmp = `${this.#path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
    renameSync(tmp, this.#path);
  }
}

function load(path: string): FileShape {
  if (!existsSync(path)) return { seen: [], free: {} };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as FileShape;
    return {
      seen: Array.isArray(raw.seen) ? raw.seen.map(String) : [],
      free:
        raw.free && typeof raw.free === "object"
          ? Object.fromEntries(
              Object.entries(raw.free).map(([k, v]) => [k, Number(v) || 0]),
            )
          : {},
    };
  } catch {
    return { seen: [], free: {} };
  }
}
