import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSessionStore, type GuestSession, type SessionStore } from "./session.js";

type Disk = { version: 1; sessions: GuestSession[] };

export function createPersistedSessionStore(opts: {
  path: string;
  ttlMs: number;
  now?: () => number;
}): SessionStore {
  const now = opts.now ?? Date.now;
  const inner = createSessionStore({ ttlMs: opts.ttlMs, now });
  if (existsSync(opts.path)) {
    const parsed = JSON.parse(readFileSync(opts.path, "utf8")) as Disk;
    for (const session of parsed.sessions ?? []) {
      if (now() - session.createdAt <= opts.ttlMs) inner.put(session);
    }
  }
  const flush = (): void => {
    const disk: Disk = { version: 1, sessions: inner.dump() };
    writeFileSync(opts.path, JSON.stringify(disk), { mode: 0o600 });
  };
  return {
    put(session) {
      inner.put(session);
      flush();
    },
    get: (id) => inner.get(id),
    delete(id) {
      inner.delete(id);
      flush();
    },
    sweep() {
      const wiped = inner.sweep();
      flush();
      return wiped;
    },
    listByDesk: (deskId) => inner.listByDesk(deskId),
    dump: () => inner.dump(),
  };
}
