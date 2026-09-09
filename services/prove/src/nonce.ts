import { randomBytes } from "node:crypto";

export type NonceStore = {
  issue(): { nonce: string; expiresAt: number };
  take(nonce: string): boolean;
};

export function createNonceStore(opts?: { ttlMs?: number; now?: () => number }): NonceStore {
  const ttlMs = opts?.ttlMs ?? 120_000;
  const now = opts?.now ?? Date.now;
  const pending = new Map<string, number>();

  return {
    issue() {
      const nonce = randomBytes(16).toString("hex");
      const expiresAt = now() + ttlMs;
      pending.set(nonce, expiresAt);
      return { nonce, expiresAt };
    },
    take(nonce) {
      const expiresAt = pending.get(nonce);
      if (expiresAt === undefined) return false;
      pending.delete(nonce);
      if (now() >= expiresAt) return false;
      return true;
    },
  };
}
