import assert from "node:assert/strict";
import { FixedRootChecker } from "../src/roots.ts";

describe("FixedRootChecker", function () {
  it("rejects zero and any other root", async function () {
    const roots = new FixedRootChecker(111n);
    assert.equal(await roots.isAcceptable(111n), true);
    assert.equal(await roots.isAcceptable(0n), false);
    assert.equal(await roots.isAcceptable(999n), false);
  });
});
