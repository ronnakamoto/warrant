import {
  chmodSync,
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createSessionStore, type GuestSession, type SessionStore } from "./session.js";

type Disk = { version: 1; sessions: GuestSession[] };

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
      if (Date.now() > deadline) throw new Error("session-store: lock timeout");
      sleepSync(20);
    }
  }
}

function atomicWrite(path: string, data: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

function cloneSession(session: GuestSession): GuestSession {
  return structuredClone(session);
}

function loadDisk(path: string): GuestSession[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Disk;
    return parsed.sessions ?? [];
  } catch {
    try {
      renameSync(path, `${path}.corrupt`);
    } catch {
      /* keep going with empty */
    }
    return [];
  }
}

export function createPersistedSessionStore(opts: {
  path: string;
  ttlMs: number;
  now?: () => number;
}): SessionStore {
  const now = opts.now ?? Date.now;
  const inner = createSessionStore({ ttlMs: opts.ttlMs, now });
  const lockPath = `${opts.path}.lock`;

  const hydrate = (): void => {
    inner.clear();
    for (const session of loadDisk(opts.path)) inner.put(session);
  };

  const flush = (): void => {
    const disk: Disk = { version: 1, sessions: inner.dump() };
    atomicWrite(opts.path, JSON.stringify(disk));
  };

  const locked = (fn: () => void): void => {
    withFileLock(lockPath, () => {
      hydrate();
      fn();
    });
  };

  withFileLock(lockPath, () => {
    hydrate();
    if (existsSync(opts.path)) flush();
  });

  return {
    put(session) {
      locked(() => {
        inner.put(session);
        flush();
      });
    },
    has(id) {
      let present = false;
      locked(() => {
        present = inner.has(id);
      });
      return present;
    },
    get(id) {
      let found: GuestSession | undefined;
      locked(() => {
        const existed = inner.has(id);
        found = inner.get(id);
        if (existed && !found) flush();
        if (found) found = cloneSession(found);
      });
      return found;
    },
    delete(id) {
      locked(() => {
        inner.delete(id);
        flush();
      });
    },
    sweep() {
      let wiped: string[] = [];
      locked(() => {
        wiped = inner.sweep();
        flush();
      });
      return wiped;
    },
    listByDesk(deskId) {
      let views = [] as ReturnType<SessionStore["listByDesk"]>;
      locked(() => {
        views = inner.listByDesk(deskId);
      });
      return views;
    },
    dump() {
      let sessions: GuestSession[] = [];
      locked(() => {
        sessions = inner.dump().map(cloneSession);
      });
      return sessions;
    },
    clear() {
      locked(() => {
        inner.clear();
        flush();
      });
    },
  };
}
