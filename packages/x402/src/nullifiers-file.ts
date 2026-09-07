import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { INullifierStore } from "@warrant/core";

type FileShape = {
  seen: string[];
  free: Record<string, number>;
};

/**
 * Durable nullifier + free-quota store (JSON file).
 * Single-process only — in-process ops are queued; corrupt files fail closed.
 */
export class FileNullifierStore implements INullifierStore {
  readonly #path: string;
  #seen: Set<string>;
  #free: Map<string, number>;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
    const loaded = load(path);
    this.#seen = new Set(loaded.seen);
    this.#free = new Map(Object.entries(loaded.free));
  }

  async takeRequest(nullifier: bigint, requestHash: bigint): Promise<"fresh" | "seen"> {
    return this.#run(() => {
      const key = `${nullifier}:${requestHash}`;
      if (this.#seen.has(key)) return "seen";
      this.#seen.add(key);
      this.#persist();
      return "fresh";
    });
  }

  async consumeFree(nullifier: bigint, limit: number): Promise<"granted" | "exhausted"> {
    return this.#run(() => {
      const key = String(nullifier);
      const used = this.#free.get(key) ?? 0;
      if (used >= limit) return "exhausted";
      this.#free.set(key, used + 1);
      this.#persist();
      return "granted";
    });
  }

  #run<T>(fn: () => T): Promise<T> {
    const next = this.#queue.then(fn, fn);
    this.#queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  #persist(): void {
    const dir = dirname(this.#path);
    mkdirSync(dir, { recursive: true });
    const body: FileShape = {
      seen: [...this.#seen],
      free: Object.fromEntries(this.#free),
    };
    const tmp = `${this.#path}.${process.pid}.tmp`;
    const lockPath = `${this.#path}.lock`;
    withFileLock(lockPath, () => {
      writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
      renameSync(tmp, this.#path);
    });
  }
}

const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = 5_000;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withFileLock(lockPath: string, fn: () => void): void {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        fn();
      } finally {
        closeSync(fd);
        try {
          unlinkSync(lockPath);
        } catch {
          /* already gone */
        }
      }
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) unlinkSync(lockPath);
      } catch {
        /* lock raced away */
      }
      if (Date.now() > deadline) throw new Error("nullifier-store: lock timeout");
      sleepSync(20);
    }
  }
}

function load(path: string): FileShape {
  if (!existsSync(path)) return { seen: [], free: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`corrupt nullifier store (not JSON): ${path}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`corrupt nullifier store (not an object): ${path}`);
  }
  const raw = parsed as Partial<FileShape>;
  if (!Array.isArray(raw.seen) || raw.free === undefined || typeof raw.free !== "object") {
    throw new Error(`corrupt nullifier store (missing seen/free): ${path}`);
  }
  return {
    seen: raw.seen.map(String),
    free: Object.fromEntries(Object.entries(raw.free).map(([k, v]) => [k, Number(v) || 0])),
  };
}
