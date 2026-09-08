import assert from "node:assert/strict";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyState } from "@warrant/agent";
import { createPersistedSessionStore } from "../src/persist.ts";
import type { GuestSession } from "../src/session.ts";

function sess(id: string, deskId: string, createdAt: number): GuestSession {
  return {
    id,
    deskId,
    createdAt,
    wallet: "0x0000000000000000000000000000000000000001",
    evmPrivateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    state: { ...emptyState(), rootName: id },
  };
}

describe("persisted session store", function () {
  it("reloads a receipt slot after a new store is opened on the same file", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    const receipt = {
      hashscan: "https://hashscan.io/testnet/transaction/0.0.10416077-1-000000000",
      nullifier: "42",
    };
    const a = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1000 });
    const kept = sess("keep", "desk-1", 1000);
    kept.receipt = receipt;
    a.put(kept);
    const b = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1000 });
    assert.deepEqual(b.listByDesk("desk-1")[0]?.receipt, receipt);
    const expired = createPersistedSessionStore({ path, ttlMs: 10, now: () => 2000 });
    assert.equal(expired.listByDesk("desk-1").length, 0);
  });

  it("reloads a live session after a new store is opened on the same file", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    const a = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1000 });
    a.put(sess("keep", "desk-1", 1000));
    const b = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1000 });
    assert.equal(b.get("keep")?.deskId, "desk-1");
    assert.equal(b.get("keep")?.evmPrivateKey.startsWith("0xaa"), true);
  });

  it("does not reload an expired session", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    const a = createPersistedSessionStore({ path, ttlMs: 10, now: () => 0 });
    a.put(sess("old", "desk-1", 0));
    const b = createPersistedSessionStore({ path, ttlMs: 10, now: () => 20 });
    assert.equal(b.get("old"), undefined);
  });

  it("purges expired session from disk on get", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    let now = 0;
    const store = createPersistedSessionStore({ path, ttlMs: 10, now: () => now });
    store.put(sess("old", "desk-1", 0));
    now = 20;
    assert.equal(store.get("old"), undefined);
    const raw = JSON.parse(await readFile(path, "utf8")) as { sessions: GuestSession[] };
    assert.equal(raw.sessions.length, 0);
    assert.equal(raw.sessions.some((s) => s.evmPrivateKey?.startsWith("0xaa")), false);
  });

  it("purges expired sessions from disk on load", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    const a = createPersistedSessionStore({ path, ttlMs: 10, now: () => 0 });
    a.put(sess("old", "desk-1", 0));
    createPersistedSessionStore({ path, ttlMs: 10, now: () => 20 });
    const raw = JSON.parse(await readFile(path, "utf8")) as { sessions: GuestSession[] };
    assert.equal(raw.sessions.length, 0);
    assert.equal(raw.sessions.some((s) => s.evmPrivateKey?.startsWith("0xaa")), false);
  });

  it("reloads a revoked session as fired after reopening store on same file", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    const a = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1000 });
    const revoked = sess("fired-1", "desk-1", 1000);
    revoked.revoked = true;
    a.put(revoked);
    const b = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1000 });
    const views = b.listByDesk("desk-1");
    assert.equal(views.length, 1);
    assert.equal(views[0]?.id, "fired-1");
    assert.equal(views[0]?.status, "fired");
  });

  it("writes the file mode 0o600", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    const store = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1 });
    store.put(sess("m", "desk-1", 1));
    const mode = (await stat(path)).mode & 0o777;
    assert.equal(mode, 0o600);
    const raw = await readFile(path, "utf8");
    assert.equal(raw.includes("0xaaaaaaaa"), true);
    assert.match(raw, /desk-1/);
  });

  it("forces 0o600 even when the file already existed as 0o644", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    writeFileSync(path, JSON.stringify({ version: 1, sessions: [] }), { mode: 0o644 });
    chmodSync(path, 0o644);
    const store = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1 });
    store.put(sess("m", "desk-1", 1));
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  });

  it("does not crash on a corrupt file and quarantines it", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    writeFileSync(path, "not-json{");
    const store = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1 });
    store.put(sess("ok", "desk-1", 1));
    assert.equal(store.get("ok")?.id, "ok");
    assert.equal(existsSync(`${path}.corrupt`), true);
    const raw = JSON.parse(await readFile(path, "utf8")) as { sessions: GuestSession[] };
    assert.equal(raw.sessions[0]?.id, "ok");
  });

  it("returns a clone so mutating get() does not rewrite disk", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    const store = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1 });
    store.put(sess("live", "desk-1", 1));
    const got = store.get("live");
    assert.ok(got);
    got.revoked = true;
    got.evmPrivateKey = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    assert.equal(store.get("live")?.revoked, undefined);
    assert.equal(store.get("live")?.evmPrivateKey.startsWith("0xaa"), true);
  });

  it("reloads disk before write so another process's session is not clobbered", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    const a = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1 });
    a.put(sess("mine", "desk-1", 1));
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        sessions: [sess("mine", "desk-1", 1), sess("theirs", "desk-1", 1)],
      }),
    );
    a.put(sess("newer", "desk-1", 1));
    const ids = a.listByDesk("desk-1").map((v) => v.id).sort();
    assert.deepEqual(ids, ["mine", "newer", "theirs"]);
  });

  it("reloads scope fetch after a new store is opened on the same file", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    const a = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1000 });
    const kept = sess("keep", "desk-1", 1000);
    kept.scope = "fetch";
    a.put(kept);
    const b = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1000 });
    assert.equal(b.get("keep")?.scope, "fetch");
  });

  it("reloads parentId and helperSessionId after a new store is opened", async function () {
    const dir = await mkdtemp(join(tmpdir(), "warrant-sess-"));
    const path = join(dir, "sessions.json");
    const a = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1000 });
    const parent = sess("parent", "desk-1", 1000);
    parent.helperSessionId = "child";
    a.put(parent);
    const child = sess("child", "desk-1", 1000);
    child.parentId = "parent";
    a.put(child);
    const b = createPersistedSessionStore({ path, ttlMs: 60_000, now: () => 1000 });
    assert.equal(b.get("parent")?.helperSessionId, "child");
    assert.equal(b.get("child")?.parentId, "parent");
    assert.deepEqual(
      b.listByDesk("desk-1").map((v) => v.id),
      ["parent"],
    );
  });
});
