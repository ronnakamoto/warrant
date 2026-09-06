import assert from "node:assert/strict";
import {
  checkAllowanceTransfers,
  isAllowancePayment,
  withAllowanceFacilitator,
} from "../src/allowance-facilitator.ts";
import type { FacilitatorClient, PaymentPayload, PaymentRequirements } from "@x402/core/server";

const requirements: PaymentRequirements = {
  scheme: "exact",
  network: "hedera:testnet",
  asset: "0.0.0",
  amount: "100000",
  payTo: "0.0.1",
  maxTimeoutSeconds: 300,
  extra: { feePayer: "0.0.7162784" },
};

function inspected(over: {
  transactionIdAccountId?: string;
  hbarTransfers?: { accountId: string; amount: string }[];
}) {
  return {
    transactionType: "TransferTransaction",
    transactionId: `${over.transactionIdAccountId ?? "0.0.9"}@1.2`,
    transactionIdAccountId: over.transactionIdAccountId ?? "0.0.9",
    hasNonTransferOperations: false,
    hbarTransfers: over.hbarTransfers ?? [
      { accountId: "0.0.8", amount: "-100000" },
      { accountId: "0.0.1", amount: "100000" },
    ],
    tokenTransfers: {},
  };
}

function payload(transaction: string): PaymentPayload {
  return {
    x402Version: 2,
    accepted: requirements,
    payload: { transaction },
  };
}

function inner(calls: { verify: number; settle: number }): FacilitatorClient {
  return {
    async getSupported() {
      return { kinds: [], extensions: [], signers: {} };
    },
    async verify() {
      calls.verify += 1;
      return { isValid: true, payer: "inner" };
    },
    async settle() {
      calls.settle += 1;
      return { success: true, transaction: "inner", network: "hedera:testnet" };
    },
  };
}

describe("allowance facilitator", function () {
  it("treats spender-as-fee-payer as the allowance path", function () {
    assert.equal(isAllowancePayment(inspected({}), "0.0.7162784"), true);
    assert.equal(
      isAllowancePayment(inspected({ transactionIdAccountId: "0.0.7162784" }), "0.0.7162784"),
      false,
    );
    const ok = checkAllowanceTransfers(inspected({}), { payTo: "0.0.1", amount: "100000" });
    assert.deepEqual(ok, { ok: true, vault: "0.0.8", spender: "0.0.9" });
    const bad = checkAllowanceTransfers(inspected({}), { payTo: "0.0.1", amount: "2" });
    assert.equal(bad.ok, false);
    const wrongMerchant = checkAllowanceTransfers(inspected({}), {
      payTo: "0.0.99",
      amount: "100000",
    });
    assert.equal(wrongMerchant.ok, false);
    assert.equal(wrongMerchant.reason, "pay_to_mismatch");
  });

  it("rejects an allowance payment to the wrong payTo", async function () {
    const { createAllowanceSigner } = await import("../../../packages/agent/src/allowance-pay.ts");
    const { PrivateKey } = await import("@x402/hedera");
    const key = PrivateKey.generateECDSA();
    const signer = createAllowanceSigner({
      accountId: "0.0.9",
      vaultAccountId: "0.0.8",
      privateKey: key.toStringRaw(),
    });
    const transaction = await signer.createPartiallySignedTransferTransaction({
      ...requirements,
    } as never);
    const calls = { verify: 0, settle: 0 };
    const fac = withAllowanceFacilitator({
      inner: inner(calls),
      submit: async () => {
        throw new Error("must not submit a wrong merchant");
      },
    });
    const verified = await fac.verify(payload(transaction), { ...requirements, payTo: "0.0.99" });
    assert.equal(verified.isValid, false);
    assert.equal(verified.invalidReason, "pay_to_mismatch");
    assert.equal(calls.verify, 0);
  });

  it("verifies and settles an allowance payload without calling Blocky402", async function () {
    const { createAllowanceSigner } = await import("../../../packages/agent/src/allowance-pay.ts");
    const { PrivateKey } = await import("@x402/hedera");
    const key = PrivateKey.generateECDSA();
    const signer = createAllowanceSigner({
      accountId: "0.0.9",
      vaultAccountId: "0.0.8",
      privateKey: key.toStringRaw(),
    });
    const transaction = await signer.createPartiallySignedTransferTransaction({
      ...requirements,
    } as never);
    const calls = { verify: 0, settle: 0 };
    let submitted = 0;
    const fac = withAllowanceFacilitator({
      inner: inner(calls),
      submit: async () => {
        submitted += 1;
        return { transactionId: "0.0.9@1.2" };
      },
    });
    const verified = await fac.verify(payload(transaction), requirements);
    assert.equal(verified.isValid, true);
    assert.equal(verified.payer, "0.0.9");
    assert.equal(calls.verify, 0);
    const settled = await fac.settle(payload(transaction), requirements);
    assert.equal(settled.success, true);
    assert.equal(submitted, 1);
    assert.equal(calls.settle, 0);
    const replay = await fac.verify(payload(transaction), requirements);
    assert.equal(replay.isValid, false);
    assert.equal(replay.invalidReason, "replay");
  });

  it("delegates facilitator-paid ExactHedera to the inner client", async function () {
    const calls = { verify: 0, settle: 0 };
    const fac = withAllowanceFacilitator({
      inner: inner(calls),
      submit: async () => {
        throw new Error("must not submit");
      },
    });
    const { createClientHederaSigner, PrivateKey } = await import("@x402/hedera");
    const key = PrivateKey.generateECDSA();
    const signer = createClientHederaSigner("0.0.9", key, { network: "hedera:testnet" });
    const transaction = await signer.createPartiallySignedTransferTransaction({
      ...requirements,
    } as never);
    const verified = await fac.verify(payload(transaction), requirements);
    assert.equal(verified.payer, "inner");
    assert.equal(calls.verify, 1);
  });
});
