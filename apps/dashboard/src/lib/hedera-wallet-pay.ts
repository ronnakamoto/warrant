import { encodePaymentSignatureHeader } from "@x402/core/http";
import { ExactHederaScheme, type ClientHederaSigner } from "@x402/hedera";

/** Minimal slice of x402 PaymentRequirements that ExactHedera needs. */
export type HederaPayRequirements = {
  scheme: string;
  network: string;
  amount: string;
  payTo: string;
  asset?: string;
  extra?: { feePayer?: string; [k: string]: unknown };
  [k: string]: unknown;
};

export type PaymentRequiredLike = {
  accepts?: unknown;
  [k: string]: unknown;
};

export type HederaWalletSigner = Pick<ClientHederaSigner, "accountId" | "createPartiallySignedTransferTransaction">;

export function requirementsFromPaymentRequired(pr: PaymentRequiredLike): HederaPayRequirements {
  const accepts = pr.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) {
    throw new Error("payment required has no accepts");
  }
  const first = accepts[0] as HederaPayRequirements;
  if (!first || typeof first !== "object") {
    throw new Error("payment required has no accepts");
  }
  return first;
}

/** Sign ExactHedera with any ClientHederaSigner. Returns a PAYMENT-SIGNATURE header value. */
export async function hederaWalletPay(
  signer: HederaWalletSigner,
  requirements: HederaPayRequirements,
  x402Version = 2,
): Promise<string> {
  const scheme = new ExactHederaScheme(signer);
  const payload = await scheme.createPaymentPayload(x402Version, requirements);
  return encodePaymentSignatureHeader(payload);
}
