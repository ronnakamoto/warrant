import assert from "node:assert/strict";
import { FETCH, TRANSLATE } from "@ronnakamoto/warrant-core";
import { emptyState, ensureIdentity, freshFieldTag } from "@warrant/agent";
import { assembleGuestTree } from "../src/mint.ts";
import { hireHelper, HELPER_BUDGET } from "../src/hire.ts";
import { createSessionStore, type GuestSession } from "../src/session.ts";

function parentSession(): GuestSession {
  const state = emptyState();
  ensureIdentity(state, "alice", "alice-hire");
  ensureIdentity(state, "orchestrator", "orch-hire");
  ensureIdentity(state, "translator", "trans-hire");
  state.humanTag = freshFieldTag();
  state.contextHash = freshFieldTag();
  state.rootName = "alice";
  state.rootTier = 0;
  state.rootEpoch = 0;
  assembleGuestTree(state, BigInt(Math.floor(Date.now() / 1000) + 1800), TRANSLATE | FETCH);
  return {
    id: "parent",
    deskId: "desk-1",
    createdAt: 1_000,
    wallet: "0x00000000000000000000000000000000000000ab",
    evmPrivateKey: "0x",
    state,
  };
}

describe("hireHelper", function () {
  it("clones a FETCH-only third hop and hides it from the desk", function () {
    const store = createSessionStore({ ttlMs: 60_000, now: () => 1_000 });
    const parent = parentSession();
    store.put(parent);
    const out = hireHelper(store, "parent");
    assert.equal(out.ok, true);
    if (!out.ok) return;
    const helper = store.get(out.helperSessionId);
    assert.ok(helper);
    assert.equal(helper.parentId, "parent");
    assert.equal(helper.createdAt, 1_000);
    assert.equal(helper.wallet, parent.wallet);
    assert.equal(helper.deskId, "desk-1");
    assert.equal(helper.evmPrivateKey, "0x");
    assert.equal(helper.state.mandates.length, 3);
    assert.equal(helper.state.mandates[2]?.from, "translator");
    assert.equal(helper.state.mandates[2]?.to, "helper");
    assert.equal(BigInt(helper.state.mandates[2]!.scope), FETCH);
    assert.equal(BigInt(helper.state.mandates[2]!.budgetCap), HELPER_BUDGET);
    assert.equal(helper.state.mandates[2]!.expiry, helper.state.mandates[1]!.expiry);
    assert.equal(helper.scope, "fetch");
    assert.equal(store.get("parent")?.state.mandates.length, 2);
    assert.equal(store.get("parent")?.helperSessionId, out.helperSessionId);
    const guestScope = TRANSLATE | FETCH;
    assert.equal(BigInt(store.get("parent")!.state.mandates[1]!.scope), guestScope);
    assert.deepEqual(store.listByDesk("desk-1").map((v) => v.id), ["parent"]);
  });

  it("overwrites the previous helper", function () {
    const store = createSessionStore({ ttlMs: 60_000, now: () => 1_000 });
    store.put(parentSession());
    const first = hireHelper(store, "parent");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = hireHelper(store, "parent");
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.notEqual(second.helperSessionId, first.helperSessionId);
    assert.equal(store.get(first.helperSessionId), undefined);
    assert.equal(store.get("parent")?.helperSessionId, second.helperSessionId);
  });

  it("rejects unknown, fired, and helper bearers", function () {
    const store = createSessionStore({ ttlMs: 60_000, now: () => 1_000 });
    assert.deepEqual(hireHelper(store, "missing"), { ok: false, error: "unknown" });
    const fired = parentSession();
    fired.revoked = true;
    store.put(fired);
    assert.deepEqual(hireHelper(store, "parent"), { ok: false, error: "fired" });
    const live = parentSession();
    live.id = "live";
    store.put(live);
    const hired = hireHelper(store, "live");
    assert.equal(hired.ok, true);
    if (!hired.ok) return;
    assert.deepEqual(hireHelper(store, hired.helperSessionId), { ok: false, error: "scope" });
  });

  it("refuses a translate-only parent before clone", function () {
    const store = createSessionStore({ ttlMs: 60_000, now: () => 1_000 });
    const parent = parentSession();
    assembleGuestTree(parent.state, BigInt(Math.floor(Date.now() / 1000) + 1800), TRANSLATE);
    store.put(parent);
    assert.deepEqual(hireHelper(store, "parent"), { ok: false, error: "scope" });
    assert.equal(store.get("parent")?.helperSessionId, undefined);
    assert.equal(store.get("parent")?.state.mandates.length, 2);
    assert.equal(store.dump().length, 1);
  });
});
