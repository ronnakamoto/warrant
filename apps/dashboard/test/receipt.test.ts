import assert from "node:assert/strict";
import { assertReceiptSuccess } from "../src/lib/registry.ts";

describe("@warrant/dashboard receipt status", function () {
  it("accepts success receipts", function () {
    assert.doesNotThrow(() =>
      assertReceiptSuccess(
        { status: "success" },
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    );
  });

  it("rejects reverted receipts before mirror mutation", function () {
    assert.throws(
      () =>
        assertReceiptSuccess(
          { status: "reverted" },
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ),
      /reverted on-chain/,
    );
  });
});
