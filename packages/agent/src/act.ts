import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { createClientHederaSigner, ExactHederaScheme, PrivateKey } from "@x402/hedera";
import type { IProver } from "@ronnakamoto/warrant-core";
import { warrantFetch } from "./fetch.js";
import {
  bindPurseFromMirror,
  defaultPursePath,
  evmAddressOf,
  FUND_HBAR,
  loadPurse,
  parsePursePrivateKey,
} from "./purse.js";
import { loadState, type WarrantState } from "./store.js";

export type ActDeps = {
  as?: string;
  state?: WarrantState;
  storePath?: string;
  fetchImpl?: typeof fetch;
  createPaymentFetch?: () => typeof fetch | Promise<typeof fetch>;
  /** Required unless `bearer` is set (hosted BFF proves). */
  prover?: IProver;
  ensureArtifacts?: () => void | Promise<void>;
  /** Hosted guest session. Same leaf as Copy / Fire. Never print. */
  bearer?: string;
};

async function bearerAct(
  url: string,
  body: string,
  bearer: string,
  deps: ActDeps,
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

function shopText(status: number, raw: string): string {
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

/** Prove locally, or pay the hosted BFF with a Copy bearer. Never print keys, bearer, warrant, or proof. */
export async function warrantAct(
  url: string,
  body: string,
  deps: ActDeps,
): Promise<{ status: number; text: string }> {
  const bearer = deps.bearer?.trim() || process.env.WARRANT_BEARER?.trim();
  if (bearer) {
    return bearerAct(url, body, bearer, deps);
  }
  const prover = deps.prover;
  if (!prover) {
    throw new Error("warrant act: prover required unless WARRANT_BEARER / --bearer is set");
  }
  await deps.ensureArtifacts?.();
  const state = deps.state ?? loadState(deps.storePath);
  const paymentFetch = await (deps.createPaymentFetch ??
    (() => hederaPaymentFetchFromEnv(process.env, deps.fetchImpl)))();
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
      prover,
      paymentFetch,
      fetchImpl: deps.fetchImpl,
    },
  );
  const raw = await res.text();
  return { status: res.status, text: shopText(res.status, raw) };
}
