import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Server-issued challenge material — never accept amount/payTo/bodyHash from the client. */
export type IssuedChallenge = {
  nonce: string;
  merkleRoot: string;
  issuedAt: string;
};

export type ChallengeStore = {
  put(issued: IssuedChallenge): void;
  resolve(nonceHint?: string): IssuedChallenge | undefined;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;

/**
 * Lookup by nonce. No "last issued" fallback — that was a single-client demo rail.
 */
export class MemoryChallengeStore implements ChallengeStore {
  readonly #byNonce = new Map<string, IssuedChallenge>();

  put(issued: IssuedChallenge): void {
    this.#byNonce.set(issued.nonce, issued);
  }

  resolve(nonceHint?: string): IssuedChallenge | undefined {
    if (!nonceHint) return undefined;
    return this.#byNonce.get(nonceHint);
  }
}

type FileShape = { byNonce: Record<string, IssuedChallenge> };

/** Durable nonce → challenge. Single-process queue; corrupt files fail closed. */
export class FileChallengeStore implements ChallengeStore {
  readonly #path: string;
  readonly #ttlMs: number;
  readonly #now: () => number;
  #byNonce: Map<string, IssuedChallenge>;

  constructor(path: string, opts?: { ttlMs?: number; now?: () => number }) {
    this.#path = path;
    this.#ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
    this.#now = opts?.now ?? Date.now;
    this.#byNonce = new Map(Object.entries(load(path).byNonce));
    this.#sweep();
  }

  put(issued: IssuedChallenge): void {
    this.#sweep();
    this.#byNonce.set(issued.nonce, issued);
    this.#persist();
  }

  resolve(nonceHint?: string): IssuedChallenge | undefined {
    if (!nonceHint) return undefined;
    this.#sweep();
    return this.#byNonce.get(nonceHint);
  }

  #sweep(): void {
    const cutoff = this.#now() - this.#ttlMs;
    for (const [nonce, issued] of this.#byNonce) {
      const at = Date.parse(issued.issuedAt);
      if (!Number.isFinite(at) || at < cutoff) this.#byNonce.delete(nonce);
    }
  }

  #persist(): void {
    const dir = dirname(this.#path);
    mkdirSync(dir, { recursive: true });
    const body: FileShape = { byNonce: Object.fromEntries(this.#byNonce) };
    const tmp = `${this.#path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
    renameSync(tmp, this.#path);
  }
}

function load(path: string): FileShape {
  if (!existsSync(path)) return { byNonce: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`corrupt challenge store (not JSON): ${path}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`corrupt challenge store (not an object): ${path}`);
  }
  const raw = (parsed as { byNonce?: unknown }).byNonce;
  if (raw === undefined) return { byNonce: {} };
  if (!raw || typeof raw !== "object") {
    throw new Error(`corrupt challenge store (bad byNonce): ${path}`);
  }
  return { byNonce: raw as Record<string, IssuedChallenge> };
}
