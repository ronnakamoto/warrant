import assert from "node:assert/strict";
import { assertNoDemoRails, shouldEnforceStrictProd } from "../src/prod-flags.ts";

const clean = {
  WARRANT_VKEY_PATH: "/tmp/vkey.json",
  REGISTRY_ADDRESS: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
};

describe("assertNoDemoRails", function () {
  it("accepts an env with demo flags off", function () {
    assert.doesNotThrow(() => assertNoDemoRails(clean));
    assert.doesNotThrow(() =>
      assertNoDemoRails({ ...clean, ALLOW_DEMO_VERIFY: "0", ALLOW_DEMO_ROOT: "false" }),
    );
  });

  it("rejects ALLOW_DEMO_VERIFY, ALLOW_DEMO_ROOT, and FIXED_MERKLE_ROOT", function () {
    assert.throws(
      () => assertNoDemoRails({ ...clean, ALLOW_DEMO_VERIFY: "1" }),
      /prod-guard:.*ALLOW_DEMO_VERIFY/,
    );
    assert.throws(
      () => assertNoDemoRails({ ...clean, ALLOW_DEMO_ROOT: "1" }),
      /prod-guard:.*ALLOW_DEMO_ROOT/,
    );
    assert.throws(
      () => assertNoDemoRails({ ...clean, FIXED_MERKLE_ROOT: "1" }),
      /prod-guard:.*FIXED_MERKLE_ROOT/,
    );
  });
});

describe("shouldEnforceStrictProd", function () {
  it("is on when WARRANT_STRICT_PROD=1 or NODE_ENV=production", function () {
    assert.equal(shouldEnforceStrictProd({ WARRANT_STRICT_PROD: "1" }), true);
    assert.equal(shouldEnforceStrictProd({ NODE_ENV: "production" }), true);
    assert.equal(shouldEnforceStrictProd({ NODE_ENV: "development" }), false);
  });
});
