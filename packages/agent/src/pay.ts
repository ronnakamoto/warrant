import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { createClientHederaSigner, ExactHederaScheme, PrivateKey } from "@x402/hedera";
import {
  bindPurseFromMirror,
  defaultPursePath,
  evmAddressOf,
  FUND_HBAR,
  loadPurse,
  parsePursePrivateKey,
} from "./purse.js";

export type PayDeps = {
  fetchImpl?: typeof fetch;
  createPaymentFetch?: () => typeof fetch | Promise<typeof fetch>;
};

function ownBalancePaymentFetch(accountId: string, keyRaw: string): typeof fetch {
  const key =
    keyRaw.startsWith("0x") || keyRaw.length === 64
      ? PrivateKey.fromStringECDSA(keyRaw)
      : parsePursePrivateKey(keyRaw);
  const signer = createClientHederaSigner(accountId, key, { network: "hedera:testnet" });
  const client = x402Client.fromConfig({
    schemes: [{ network: "hedera:*", client: new ExactHederaScheme(signer) }],
    spendControls: false,
  });
  return wrapFetchWithPayment(globalThis.fetch, client);
}

export async function hederaPaymentFetchFromEnv(
  env: NodeJS.Dict<string> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<typeof fetch> {
  const path = env.WARRANT_PURSE ?? defaultPursePath();
  let purse = loadPurse(path);
  if (purse && !purse.accountId) {
    try {
      purse = await bindPurseFromMirror(path, fetchImpl);
    } catch {
      /* still unfunded */
    }
  }
  if (purse?.accountId) {
    return ownBalancePaymentFetch(purse.accountId, purse.privateKey);
  }
  const accountId = env.HEDERA_ACCOUNT_ID;
  const keyRaw = env.HEDERA_PRIVATE_KEY;
  if (accountId && keyRaw) {
    return ownBalancePaymentFetch(accountId, keyRaw);
  }
  const evm = purse ? evmAddressOf(purse) : undefined;
  throw new Error(
    evm
      ? `not funded yet — send about ${FUND_HBAR} HBAR to ${evm}, then warrant act`
      : "no spender — `warrant ready`, send HBAR to the 0x address, then `warrant act`. Or set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY.",
  );
}

export function shopText(status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { text?: unknown; error?: unknown; hashscan?: unknown };
    if (typeof parsed.text === "string") {
      const scan = typeof parsed.hashscan === "string" ? parsed.hashscan.trim() : "";
      return scan ? `${parsed.text}\n${scan}` : parsed.text;
    }
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    /* not JSON */
  }
  return raw.slice(0, 500);
}

/** Pay the hosted BFF with a Copy bearer. Never print keys, bearer, warrant, or proof. */
export async function warrantPay(
  url: string,
  body: string,
  bearer: string,
  deps: PayDeps = {},
): Promise<{ status: number; text: string }> {
  const paymentFetch = await (deps.createPaymentFetch ??
    (() => hederaPaymentFetchFromEnv(process.env, deps.fetchImpl)))();
  const res = await paymentFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${bearer}`,
    },
    body,
  });
  const raw = await res.text();
  return { status: res.status, text: shopText(res.status, raw) };
}
