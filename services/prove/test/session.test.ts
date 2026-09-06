import assert from "node:assert/strict";
import { emptyState } from "@warrant/agent";
import { createSessionStore, type GuestSession } from "../src/session.ts";

function session(id: string, createdAt: number): GuestSession {
  return {
    id,
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
});
