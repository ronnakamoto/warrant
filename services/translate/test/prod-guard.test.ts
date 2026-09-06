import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertProductionTranslateEnv,
  shouldEnforceStrictProd,
} from "../src/prod-guard.ts";

const vkeyPath = join(tmpdir(), `warrant-vkey-${process.pid}.json`);
writeFileSync(vkeyPath, "{}");

const base = {
  WARRANT_VKEY_PATH: vkeyPath,
  REGISTRY_ADDRESS: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
  BASE_SEPOLIA_RPC: "https://sepolia.base.org",
};

describe("assertProductionTranslateEnv", function () {
  it("accepts a complete production env", function () {
    assert.doesNotThrow(() => assertProductionTranslateEnv(base));
  });

  it("rejects ALLOW_DEMO_VERIFY", function () {
    assert.throws(
      () => assertProductionTranslateEnv({ ...base, ALLOW_DEMO_VERIFY: "1" }),
      /prod-guard:.*ALLOW_DEMO_VERIFY/,
    );
  });

  it("rejects ALLOW_DEMO_ROOT", function () {
    assert.throws(
      () => assertProductionTranslateEnv({ ...base, ALLOW_DEMO_ROOT: "1" }),
      /prod-guard:.*ALLOW_DEMO_ROOT/,
    );
  });

  it("rejects FIXED_MERKLE_ROOT", function () {
    assert.throws(
      () => assertProductionTranslateEnv({ ...base, FIXED_MERKLE_ROOT: "1" }),
      /prod-guard:.*FIXED_MERKLE_ROOT/,
    );
  });

  it("rejects missing vkey", function () {
    const { WARRANT_VKEY_PATH: _, ...rest } = base;
    assert.throws(() => assertProductionTranslateEnv(rest), /prod-guard:.*WARRANT_VKEY_PATH/);
  });

  it("rejects missing registry", function () {
    const { REGISTRY_ADDRESS: _, ...rest } = base;
    assert.throws(() => assertProductionTranslateEnv(rest), /prod-guard:.*REGISTRY_ADDRESS/);
  });

  it("treats 0/false as off for demo flags", function () {
    assert.doesNotThrow(() =>
      assertProductionTranslateEnv({ ...base, ALLOW_DEMO_VERIFY: "0", ALLOW_DEMO_ROOT: "false" }),
    );
  });

  it("rejects a vkey path that is not a file", function () {
    assert.throws(
      () =>
        assertProductionTranslateEnv({
          ...base,
          WARRANT_VKEY_PATH: "/tmp/warrant-missing-vkey.json",
        }),
      /prod-guard:.*vkey file/,
    );
  });

  it("rejects WARRANT_GUEST_SPONSOR", function () {
    assert.throws(
      () => assertProductionTranslateEnv({ ...base, WARRANT_GUEST_SPONSOR: "1" }),
      /prod-guard:.*WARRANT_GUEST_SPONSOR/,
    );
  });

  it("rejects merchant payTo equal to the Hedera operator account", function () {
    assert.throws(
      () =>
        assertProductionTranslateEnv({
          ...base,
          HEDERA_PAY_TO: "0.0.10311260",
          HEDERA_ACCOUNT_ID: "0.0.10311260",
        }),
      /prod-guard:.*HEDERA_PAY_TO/,
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
