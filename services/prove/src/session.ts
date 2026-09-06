import { randomBytes } from "node:crypto";
import type { WarrantState } from "@warrant/agent";
import type { Address, Hex } from "viem";

export type WarrantStatus = "live" | "fired";

export type WarrantView = {
  id: string;
  status: WarrantStatus;
  createdAt: number;
  remainingMs: number;
};

export type GuestSession = {
  id: string;
  deskId: string;
  state: WarrantState;
  evmPrivateKey: Hex;
  wallet: Address;
  createdAt: number;
  revoked?: boolean;
};

export type SessionStore = {
  put(session: GuestSession): void;
  has(id: string): boolean;
  get(id: string): GuestSession | undefined;
  delete(id: string): void;
  sweep(): string[];
  listByDesk(deskId: string): WarrantView[];
  dump(): GuestSession[];
  clear(): void;
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

export const createDeskId = createSessionId;

export function warrantView(session: GuestSession, now: number, ttlMs: number): WarrantView {
  const remainingMs = Math.max(0, session.createdAt + ttlMs - now);
  return {
    id: session.id,
    status: session.revoked ? "fired" : "live",
    createdAt: session.createdAt,
    remainingMs,
  };
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
    has(id) {
      return map.has(id);
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
    listByDesk(deskId) {
      const views: WarrantView[] = [];
      for (const session of map.values()) {
        if (session.deskId !== deskId) continue;
        if (expired(session)) continue;
        views.push(warrantView(session, now(), opts.ttlMs));
      }
      views.sort((a, b) => a.createdAt - b.createdAt);
      return views;
    },
    dump() {
      const sessions: GuestSession[] = [];
      for (const session of map.values()) {
        if (expired(session)) continue;
        sessions.push(session);
      }
      return sessions;
    },
    clear() {
      for (const session of map.values()) wipeKey(session);
      map.clear();
    },
  };
}
