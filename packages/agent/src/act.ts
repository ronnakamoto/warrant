import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { createClientHederaSigner, ExactHederaScheme, PrivateKey } from "@x402/hedera";
import type { IProver } from "@warrant/core";
import { allowancePaymentFetch } from "./allowance-pay.js";
import { warrantFetch } from "./fetch.js";
import { defaultPursePath, loadPurse } from "./purse.js";
import { loadState, type WarrantState } from "./store.js";

export type ActDeps = {
  as?: string;
  state?: WarrantState;
  storePath?: string;
  fetchImpl?: typeof fetch;
  createPaymentFetch?: () => typeof fetch | Promise<typeof fetch>;
  prover: IProver;
  ensureArtifacts?: () => void | Promise<void>;
};

export function hederaPaymentFetchFromEnv(
  env: NodeJS.Dict<string> = process.env,
): typeof fetch {
  const purse = loadPurse(env.WARRANT_PURSE ?? defaultPursePath());
  if (purse?.accountId && purse.vaultAccountId) {
    return allowancePaymentFetch(purse);
  }
  const accountId = env.HEDERA_ACCOUNT_ID;
  const keyRaw = env.HEDERA_PRIVATE_KEY;
  if (!accountId || !keyRaw) {
    throw new Error(
      "no spender — `warrant purse init`, approve spend in the tab, then `warrant purse bind`. Or set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY for a float.",
    );
  }
  const key = keyRaw.startsWith("0x")
    ? PrivateKey.fromStringECDSA(keyRaw)
    : PrivateKey.fromString(keyRaw);
  const signer = createClientHederaSigner(accountId, key, { network: "hedera:testnet" });
  const client = x402Client.fromConfig({
    schemes: [{ network: "hedera:*", client: new ExactHederaScheme(signer) }],
    spendControls: false,
  });
  return wrapFetchWithPayment(globalThis.fetch, client);
}

function shopText(status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { text?: unknown; error?: unknown };
    if (typeof parsed.text === "string") return parsed.text;
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    /* not JSON */
  }
  return raw.slice(0, 500);
}

/** Prove locally, pay ExactHedera, retry. Never print keys, bearer, warrant, or proof. */
export async function warrantAct(
  url: string,
  body: string,
  deps: ActDeps,
): Promise<{ status: number; text: string }> {
  await deps.ensureArtifacts?.();
  const state = deps.state ?? loadState(deps.storePath);
  const paymentFetch = await (deps.createPaymentFetch ?? hederaPaymentFetchFromEnv)();
  const res = await warrantFetch(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
    {
      as: deps.as ?? "translator",
      state,
      prover: deps.prover,
      paymentFetch,
      fetchImpl: deps.fetchImpl,
    },
  );
  const raw = await res.text();
  return { status: res.status, text: shopText(res.status, raw) };
}
