import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import {
  createClientHederaSigner,
  ExactHederaScheme,
  PrivateKey,
} from "@x402/hedera";

export type HederaPay = { accountId: string; privateKey: string };

/** Caller-signed ExactHedera fetch. Do not log `pay`. */
export function hederaPaymentFetch(pay: HederaPay): typeof fetch {
  const key = pay.privateKey.startsWith("0x")
    ? PrivateKey.fromStringECDSA(pay.privateKey)
    : PrivateKey.fromString(pay.privateKey);
  const signer = createClientHederaSigner(pay.accountId, key, {
    network: "hedera:testnet",
  });
  const client = x402Client.fromConfig({
    schemes: [{ network: "hedera:*", client: new ExactHederaScheme(signer) }],
    spendControls: false,
  });
  return wrapFetchWithPayment(globalThis.fetch, client);
}
