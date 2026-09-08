import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertProductionMemoEnv } from "../src/prod-guard.ts";

const vkeyPath = join(tmpdir(), `warrant-memo-vkey-${process.pid}.json`);
writeFileSync(vkeyPath, "{}");

const base = {
  WARRANT_VKEY_PATH: vkeyPath,
  REGISTRY_ADDRESS: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
  BASE_SEPOLIA_RPC: "https://sepolia.base.org",
  HEDERA_PAY_TO: "0.0.10311260",
  HEDERA_MEMO_TOPIC_ID: "0.0.10336559",
  HEDERA_ACCOUNT_ID: "0.0.10311260",
  HEDERA_PRIVATE_KEY: "0x11",
  WARRANT_NULLIFIER_PATH: "/tmp/warrant-memo-nullifiers.json",
  WARRANT_CHALLENGE_PATH: "/tmp/warrant-memo-challenges.json",
};

describe("assertProductionMemoEnv", function () {
  it("accepts a complete production env", function () {
    assert.doesNotThrow(() => assertProductionMemoEnv(base));
  });

  it("rejects ALLOW_DEMO_VERIFY", function () {
    assert.throws(
      () => assertProductionMemoEnv({ ...base, ALLOW_DEMO_VERIFY: "1" }),
      /prod-guard:.*ALLOW_DEMO_VERIFY/,
    );
  });

  it("rejects ALLOW_DEMO_ROOT", function () {
    assert.throws(
      () => assertProductionMemoEnv({ ...base, ALLOW_DEMO_ROOT: "1" }),
      /prod-guard:.*ALLOW_DEMO_ROOT/,
    );
  });

  it("rejects FIXED_MERKLE_ROOT", function () {
    assert.throws(
      () => assertProductionMemoEnv({ ...base, FIXED_MERKLE_ROOT: "1" }),
      /prod-guard:.*FIXED_MERKLE_ROOT/,
    );
  });

  it("rejects missing vkey", function () {
    const { WARRANT_VKEY_PATH: _, ...rest } = base;
    assert.throws(() => assertProductionMemoEnv(rest), /prod-guard:.*WARRANT_VKEY_PATH/);
  });

  it("rejects missing HEDERA_MEMO_TOPIC_ID", function () {
    const { HEDERA_MEMO_TOPIC_ID: _, ...rest } = base;
    assert.throws(() => assertProductionMemoEnv(rest), /prod-guard:.*HEDERA_MEMO_TOPIC_ID/);
  });

  it("does not require an HCS audit trio", function () {
    assert.doesNotThrow(() => {
      const { HEDERA_TOPIC_ID: _unused, ...noAuditTopic } = {
        ...base,
        HEDERA_TOPIC_ID: "0.0.10336558",
      };
      assertProductionMemoEnv(noAuditTopic);
    });
    assert.doesNotThrow(() => assertProductionMemoEnv(base));
  });
});
