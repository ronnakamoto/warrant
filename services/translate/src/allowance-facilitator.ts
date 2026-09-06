import {
  createHederaClient,
  extractTransactionFromPayload,
  getNetForAccount,
  inspectHederaTransaction,
  Transaction,
  type InspectedHederaTransaction,
} from "@x402/hedera";
import type {
  FacilitatorClient,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/server";

export type AllowanceCheck =
  | { ok: true; vault: string; spender: string }
  | { ok: false; reason: string };

/** True when the agent (spender) is the fee payer, not the advertised facilitator. */
export function isAllowancePayment(
  inspected: InspectedHederaTransaction,
  advertisedFeePayer: string,
): boolean {
  return inspected.transactionIdAccountId !== advertisedFeePayer;
}

/**
 * Vault is debited, shop is credited, spender is only the fee payer.
 * ExactHedera's facilitator-as-fee-payer path never looks like this.
 */
export function checkAllowanceTransfers(
  inspected: InspectedHederaTransaction,
  requirements: { payTo: string; amount: string },
): AllowanceCheck {
  if (inspected.hasNonTransferOperations) {
    return { ok: false, reason: "not_transfer" };
  }
  const amount = BigInt(requirements.amount);
  if (amount <= 0n) return { ok: false, reason: "bad_amount" };
  const spender = inspected.transactionIdAccountId;
  const credited = getNetForAccount(inspected.hbarTransfers, requirements.payTo);
  if (credited !== amount) return { ok: false, reason: "pay_to_mismatch" };
  const vaults = inspected.hbarTransfers.filter((row) => {
    if (row.accountId === spender || row.accountId === requirements.payTo) return false;
    return BigInt(row.amount) === -amount;
  });
  if (vaults.length !== 1) return { ok: false, reason: "vault_mismatch" };
  return { ok: true, vault: vaults[0]!.accountId, spender };
}

export type AllowanceFacilitatorDeps = {
  inner: FacilitatorClient;
  submit?: (transactionBase64: string) => Promise<{ transactionId: string }>;
  seen?: Set<string>;
  alreadySettled?: (transactionId: string) => Promise<boolean>;
};

function advertisedFeePayer(requirements: PaymentRequirements): string | undefined {
  const extra = requirements.extra as { feePayer?: unknown } | undefined;
  return typeof extra?.feePayer === "string" ? extra.feePayer : undefined;
}

function payloadTransaction(paymentPayload: PaymentPayload): string | undefined {
  try {
    return extractTransactionFromPayload(
      paymentPayload.payload as { transaction?: string },
    );
  } catch {
    return undefined;
  }
}

async function defaultSubmit(transactionBase64: string): Promise<{ transactionId: string }> {
  const tx = Transaction.fromBytes(Buffer.from(transactionBase64, "base64"));
  const client = createHederaClient("hedera:testnet");
  try {
    const response = await tx.execute(client);
    await response.getReceipt(client);
    return { transactionId: response.transactionId.toString() };
  } finally {
    client.close();
  }
}

/** Intercepts spender-as-fee-payer ExactHedera payloads. Everything else stays with Blocky402. */
export function withAllowanceFacilitator(deps: AllowanceFacilitatorDeps): FacilitatorClient {
  const seen = deps.seen ?? new Set<string>();
  const submit = deps.submit ?? defaultSubmit;
  const alreadySettled = deps.alreadySettled ?? (async () => false);

  return {
    getSupported: () => deps.inner.getSupported(),
    async verify(paymentPayload, paymentRequirements): Promise<VerifyResponse> {
      const feePayer = advertisedFeePayer(paymentRequirements);
      const transaction = payloadTransaction(paymentPayload);
      if (!feePayer || !transaction) {
        return deps.inner.verify(paymentPayload, paymentRequirements);
      }
      let inspected: InspectedHederaTransaction;
      try {
        inspected = inspectHederaTransaction(transaction);
      } catch {
        return deps.inner.verify(paymentPayload, paymentRequirements);
      }
      if (!isAllowancePayment(inspected, feePayer)) {
        return deps.inner.verify(paymentPayload, paymentRequirements);
      }
      const check = checkAllowanceTransfers(inspected, {
        payTo: paymentRequirements.payTo,
        amount: paymentRequirements.amount,
      });
      if (!check.ok) {
        return { isValid: false, invalidReason: check.reason };
      }
      if (seen.has(inspected.transactionId) || (await alreadySettled(inspected.transactionId))) {
        return { isValid: false, invalidReason: "replay" };
      }
      return { isValid: true, payer: check.spender };
    },
    async settle(paymentPayload, paymentRequirements): Promise<SettleResponse> {
      const feePayer = advertisedFeePayer(paymentRequirements);
      const transaction = payloadTransaction(paymentPayload);
      const network = paymentRequirements.network;
      if (!feePayer || !transaction) {
        return deps.inner.settle(paymentPayload, paymentRequirements);
      }
      let inspected: InspectedHederaTransaction;
      try {
        inspected = inspectHederaTransaction(transaction);
      } catch {
        return deps.inner.settle(paymentPayload, paymentRequirements);
      }
      if (!isAllowancePayment(inspected, feePayer)) {
        return deps.inner.settle(paymentPayload, paymentRequirements);
      }
      if (seen.has(inspected.transactionId) || (await alreadySettled(inspected.transactionId))) {
        return {
          success: false,
          errorReason: "replay",
          transaction: inspected.transactionId,
          network,
        };
      }
      try {
        const settled = await submit(transaction);
        seen.add(inspected.transactionId);
        seen.add(settled.transactionId);
        return {
          success: true,
          payer: inspected.transactionIdAccountId,
          transaction: settled.transactionId,
          network,
        };
      } catch (err) {
        return {
          success: false,
          errorReason: "transaction_failed",
          errorMessage: err instanceof Error ? err.message : "settle failed",
          transaction: inspected.transactionId,
          network,
        };
      }
    },
  };
}
