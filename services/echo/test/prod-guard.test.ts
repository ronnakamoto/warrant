import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertProductionEchoEnv } from "../src/prod-guard.ts";

const vkeyPath = join(tmpdir(), `warrant-echo-vkey-${process.pid}.json`);
writeFileSync(vkeyPath, "{}");

const base = {
  WARRANT_VKEY_PATH: vkeyPath,
  REGISTRY_ADDRESS: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
  BASE_SEPOLIA_RPC: "https://sepolia.base.org",
  HEDERA_PAY_TO: "0.0.10311260",
};

describe("assertProductionEchoEnv", function () {
  it("accepts a complete production env", function () {
    assert.doesNotThrow(() => assertProductionEchoEnv(base));
  });

  it("rejects ALLOW_DEMO_VERIFY", function () {
    assert.throws(
      () => assertProductionEchoEnv({ ...base, ALLOW_DEMO_VERIFY: "1" }),
      /prod-guard:.*ALLOW_DEMO_VERIFY/,
    );
  });

  it("rejects ALLOW_DEMO_ROOT", function () {
    assert.throws(
      () => assertProductionEchoEnv({ ...base, ALLOW_DEMO_ROOT: "1" }),
      /prod-guard:.*ALLOW_DEMO_ROOT/,
    );
  });

  it("rejects FIXED_MERKLE_ROOT", function () {
    assert.throws(
      () => assertProductionEchoEnv({ ...base, FIXED_MERKLE_ROOT: "1" }),
      /prod-guard:.*FIXED_MERKLE_ROOT/,
    );
  });

  it("rejects missing vkey", function () {
    const { WARRANT_VKEY_PATH: _, ...rest } = base;
    assert.throws(() => assertProductionEchoEnv(rest), /prod-guard:.*WARRANT_VKEY_PATH/);
  });

  it("does not require an HCS trio", function () {
    assert.doesNotThrow(() => assertProductionEchoEnv(base));
  });
});
