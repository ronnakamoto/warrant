import assert from "node:assert/strict";
import { emptyState } from "@warrant/agent";
import { createSessionStore, createDeskId, type GuestSession } from "../src/session.ts";

function session(id: string, createdAt: number, deskId = "desk"): GuestSession {
  return {
    id,
    deskId,
    createdAt,
    wallet: "0x0000000000000000000000000000000000000001",
    evmPrivateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    state: { ...emptyState(), rootName: id },
  };
}

describe("guest session store", function () {
  it("put/get returns the session", function () {
    const store = createSessionStore({ ttlMs: 60_000, now: () => 1000 });
    store.put(session("a", 1000));
    assert.equal(store.get("a")?.id, "a");
  });

  it("expires and wipes the key", function () {
    let now = 0;
    const store = createSessionStore({ ttlMs: 10, now: () => now });
    const s = session("b", 0);
    store.put(s);
    now = 20;
    assert.equal(store.get("b"), undefined);
    assert.equal(s.evmPrivateKey, "0x");
    assert.equal(s.state.rootName, undefined);
  });

  it("isolates two sessions", function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    const a = session("a", Date.now());
    const b = session("b", Date.now());
    b.evmPrivateKey = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    store.put(a);
    store.put(b);
    assert.notEqual(store.get("a")?.evmPrivateKey, store.get("b")?.evmPrivateKey);
    assert.notEqual(store.get("a")?.state.rootName, store.get("b")?.state.rootName);
  });

  it("sweep returns wiped ids", function () {
    let now = 0;
    const store = createSessionStore({ ttlMs: 5, now: () => now });
    store.put(session("old", 0));
    now = 10;
    assert.deepEqual(store.sweep(), ["old"]);
  });

  it("lists live and fired views for one desk and hides another desk", function () {
    const store = createSessionStore({ ttlMs: 60_000, now: () => 10_000 });
    store.put(session("a", 0, "desk-1"));
    const fired = session("b", 0, "desk-1");
    fired.revoked = true;
    store.put(fired);
    store.put(session("c", 0, "desk-2"));
    const views = store.listByDesk("desk-1");
    assert.deepEqual(
      views.map((v) => [v.id, v.status]),
      [
        ["a", "live"],
        ["b", "fired"],
      ],
    );
    assert.equal(
      views.every((v) => v.remainingMs === 50_000),
      true,
    );
    assert.equal(
      store.listByDesk("desk-2").map((v) => v.id).join(),
      "c",
    );
  });

  it("createDeskId is 32 hex and not equal twice", function () {
    const a = createDeskId();
    const b = createDeskId();
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.notEqual(a, b);
  });

  it("clear wipes keys and empties the map", function () {
    const store = createSessionStore({ ttlMs: 60_000, now: () => 1000 });
    const s = session("z", 1000);
    store.put(s);
    store.clear();
    assert.equal(store.get("z"), undefined);
    assert.equal(s.evmPrivateKey, "0x");
  });
});
