import { randomBytes } from "node:crypto";
import type { WarrantState } from "@warrant/agent";
import type { Address, Hex } from "viem";

export type GuestSession = {
  id: string;
  state: WarrantState;
  evmPrivateKey: Hex;
  wallet: Address;
  createdAt: number;
  revoked?: boolean;
};

export type SessionStore = {
  put(session: GuestSession): void;
  get(id: string): GuestSession | undefined;
  delete(id: string): void;
  sweep(): string[];
};

function wipeKey(session: GuestSession): void {
  session.evmPrivateKey = "0x" as Hex;
  session.state = {
    version: 1,
    identities: {},
    members: [],
    mandates: [],
  };
}

export function createSessionId(): string {
  return randomBytes(16).toString("hex");
}

export function createSessionStore(opts: {
  ttlMs: number;
  now?: () => number;
}): SessionStore {
  const map = new Map<string, GuestSession>();
  const now = opts.now ?? Date.now;

  const expired = (session: GuestSession): boolean =>
    now() - session.createdAt > opts.ttlMs;

  return {
    put(session) {
      map.set(session.id, session);
    },
    get(id) {
      const session = map.get(id);
      if (!session) return undefined;
      if (expired(session)) {
        wipeKey(session);
        map.delete(id);
        return undefined;
      }
      return session;
    },
    delete(id) {
      const session = map.get(id);
      if (session) wipeKey(session);
      map.delete(id);
    },
    sweep() {
      const wiped: string[] = [];
      for (const [id, session] of map) {
        if (expired(session)) {
          wipeKey(session);
          map.delete(id);
          wiped.push(id);
        }
      }
      return wiped;
    },
  };
}
