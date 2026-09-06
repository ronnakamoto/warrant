import { HEDERA_FAUCET } from "./guest-copy";
import type { HederaPay } from "./hedera-pay";
import {
  challengeFrom402,
  hashTranslateBody,
  paymentRequiredFromResponse,
  proveConfig,
  proveRequest,
  publicGuestError,
} from "./prove-client";

export type ActResult = { status: number; body: Record<string, unknown> };

export type LiveWarrant = { id: string; status: string };

export type ShopInput = {
  text: string;
  source: string;
  target: string;
  hederaAccountId?: string;
  hederaPrivateKey?: string;
};

export type TranslateDeps = {
  fetchImpl?: typeof fetch;
  createPaymentFetch?: (pay: HederaPay) => typeof fetch | Promise<typeof fetch>;
  translateUrl?: string;
  prove?: typeof proveRequest;
};

export function hederaPayFrom(input: ShopInput): HederaPay | undefined {
  if (input.hederaAccountId && input.hederaPrivateKey) {
    return { accountId: input.hederaAccountId, privateKey: input.hederaPrivateKey };
  }
  return undefined;
}

export function parseShopBody(raw: unknown): ShopInput | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as {
    text?: unknown;
    source?: unknown;
    target?: unknown;
    hederaAccountId?: unknown;
    hederaPrivateKey?: unknown;
  };
  const account = typeof input.hederaAccountId === "string" ? input.hederaAccountId.trim() : "";
  const key = typeof input.hederaPrivateKey === "string" ? input.hederaPrivateKey.trim() : "";
  return {
    text: typeof input.text === "string" ? input.text : "",
    source: typeof input.source === "string" ? input.source : "en",
    target: typeof input.target === "string" ? input.target : "es",
    ...(account && key ? { hederaAccountId: account, hederaPrivateKey: key } : {}),
  };
}

export async function shopWithWarrant(
  translateUrl: string,
  payload: string,
  warrant: string,
  pay: HederaPay | undefined,
  deps: TranslateDeps = {},
): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const runner =
    pay !== undefined
      ? await (deps.createPaymentFetch ??
          (await import("./hedera-pay")).hederaPaymentFetch)(pay)
      : fetchImpl;
  return runner(translateUrl, {
    method: "POST",
    headers: { "content-type": "application/json", warrant },
    body: payload,
  });
}

function paywall(): ActResult {
  return { status: 402, body: { error: "pay", faucet: HEDERA_FAUCET } };
}

export async function revokeEachLive(
  warrants: LiveWarrant[],
  revoke: (id: string) => Promise<{ ok: boolean; txHash?: string }>,
): Promise<{ txHashes: string[]; failed: number }> {
  const txHashes: string[] = [];
  let failed = 0;
  for (const warrant of warrants) {
    if (warrant.status !== "live") continue;
    const out = await revoke(warrant.id);
    if (out.ok) {
      if (typeof out.txHash === "string" && out.txHash.length > 0) txHashes.push(out.txHash);
    } else {
      failed += 1;
    }
  }
  return { txHashes, failed };
}

export async function translateForSession(
  sessionId: string,
  input: ShopInput,
  req?: Request,
  deps: TranslateDeps = {},
): Promise<ActResult> {
  const { text, source, target } = input;
  const payload = JSON.stringify({ text, source, target });
  const translateUrl = deps.translateUrl ?? proveConfig().translateUrl;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const probe = await fetchImpl(translateUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });

  if (probe.status === 200) {
    return { status: 200, body: (await probe.json()) as Record<string, unknown> };
  }
  if (probe.status === 403) {
    const err = (await probe.json().catch(() => ({}))) as { error?: string };
    return { status: 403, body: { error: typeof err.error === "string" ? err.error : "root_revoked" } };
  }
  if (probe.status !== 402) {
    return { status: probe.status, body: { error: `translate HTTP ${probe.status}` } };
  }

  const rawBody = (await probe.json().catch(() => ({}))) as Record<string, unknown>;
  const pr = paymentRequiredFromResponse(probe.headers, rawBody) ?? {};
  const extensions = pr.extensions as { warrant?: unknown } | undefined;
  if (!extensions?.warrant) {
    return paywall();
  }

  const pay = hederaPayFrom(input);
  if (!pay) {
    return paywall();
  }

  const url = new URL(translateUrl);
  const challenge = challengeFrom402(pr, "POST", url.pathname, hashTranslateBody(text, source, target));
  const prove = deps.prove ?? proveRequest;
  const proved = await prove("/v1/prove", { sessionId, challenge }, req);
  const provedBody = (await proved.json().catch(() => ({}))) as {
    warrant?: string;
    nullifier?: string;
    error?: string;
  };
  if (!proved.ok || !provedBody.warrant) {
    return {
      status: proved.status === 408 ? 408 : 502,
      body: { error: provedBody.error ?? "prove failed" },
    };
  }

  let retry: Response;
  try {
    retry = await shopWithWarrant(translateUrl, payload, provedBody.warrant, pay, deps);
  } catch {
    return paywall();
  }
  if (retry.status === 402) return paywall();
  if (retry.status === 403) return { status: 403, body: { error: "root_revoked" } };
  if (!retry.ok) return { status: retry.status, body: { error: `translate HTTP ${retry.status}` } };
  const translated = (await retry.json()) as {
    text?: string;
    source?: string;
    target?: string;
    txId?: string;
  };
  const txId = txIdFromPaymentResponse(retry.headers, translated.txId);
  return {
    status: 200,
    body: {
      text: translated.text,
      source: translated.source ?? source,
      target: translated.target ?? target,
      nullifier: provedBody.nullifier,
      ...(txId ? { txId } : {}),
    },
  };
}

/** Body txId wins; else PAYMENT-RESPONSE (client-signed settle). */
export function txIdFromPaymentResponse(headers: Headers, bodyTxId?: string): string | undefined {
  if (typeof bodyTxId === "string" && bodyTxId.length > 0) return bodyTxId;
  const header = headers.get("PAYMENT-RESPONSE") ?? headers.get("payment-response");
  if (!header) return undefined;
  const candidates = [header];
  try {
    candidates.push(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    /* ignore */
  }
  for (const raw of candidates) {
    try {
      const decoded = JSON.parse(raw) as { transaction?: string };
      if (typeof decoded.transaction === "string" && decoded.transaction.length > 0) {
        return decoded.transaction;
      }
    } catch {
      /* try next */
    }
  }
  return undefined;
}

export { publicGuestError };
