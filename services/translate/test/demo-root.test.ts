import assert from "node:assert/strict";
import { fixedMerkleRootFromEnv } from "../src/demo-root.ts";

describe("FIXED_MERKLE_ROOT env guard", function () {
  it("rejects without ALLOW_DEMO_ROOT", function () {
    assert.throws(
      () =>
        fixedMerkleRootFromEnv({
          FIXED_MERKLE_ROOT: "123",
        }),
      /ALLOW_DEMO_ROOT/,
    );
  });

  it("accepts with ALLOW_DEMO_ROOT=1", function () {
    assert.equal(
      fixedMerkleRootFromEnv({
        FIXED_MERKLE_ROOT: "123",
        ALLOW_DEMO_ROOT: "1",
      }),
      123n,
    );
  });

  it("undefined when unset", function () {
    assert.equal(fixedMerkleRootFromEnv({}), undefined);
  });
});
