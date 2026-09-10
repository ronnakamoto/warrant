import assert from "node:assert/strict";
import { createNonceStore } from "../src/nonce.ts";

describe("nonce store", function () {
  it("issue then take is true once", function () {
    const store = createNonceStore();
    const { nonce, expiresAt } = store.issue();
    assert.match(nonce, /^[0-9a-f]{32}$/);
    assert.equal(typeof expiresAt, "number");
    assert.equal(store.take(nonce), true);
    assert.equal(store.take(nonce), false);
  });

  it("expired nonce take is false", function () {
    let t = 1_000;
    const store = createNonceStore({ ttlMs: 100, now: () => t });
    const { nonce } = store.issue();
    t = 1_000 + 101;
    assert.equal(store.take(nonce), false);
  });

  it("sweep drops expired nonces and keeps live ones", function () {
    let t = 1_000;
    const store = createNonceStore({ ttlMs: 100, now: () => t });
    const stale = store.issue().nonce;
    t = 1_050;
    const live = store.issue().nonce;
    t = 1_101;
    assert.equal(store.sweep(), 1);
    assert.equal(store.take(stale), false);
    assert.equal(store.take(live), true);
  });
});
