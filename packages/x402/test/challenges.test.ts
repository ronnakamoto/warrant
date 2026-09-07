import assert from "node:assert/strict";
import { MemoryChallengeStore } from "../src/challenges.ts";

describe("ChallengeStore", function () {
  it("resolve without a nonce hint is undefined (no last-issued fallback)", function () {
    const store = new MemoryChallengeStore();
    store.put({ nonce: "abc", merkleRoot: "1", issuedAt: new Date().toISOString() });
    assert.equal(store.resolve(), undefined);
    assert.equal(store.resolve("abc")?.merkleRoot, "1");
    assert.equal(store.resolve("nope"), undefined);
  });
});
