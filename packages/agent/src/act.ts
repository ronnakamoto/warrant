import type { IProver } from "@ronnakamoto/warrant-core";
import { warrantFetch } from "./fetch.js";
import { hederaPaymentFetchFromEnv, shopText, warrantPay, type PayDeps } from "./pay.js";
import { loadState, type WarrantState } from "./store.js";

export { hederaPaymentFetchFromEnv } from "./pay.js";

export type ActDeps = PayDeps & {
  as?: string;
  state?: WarrantState;
  storePath?: string;
  /** Required unless `bearer` is set (hosted BFF proves). */
  prover?: IProver;
  ensureArtifacts?: () => void | Promise<void>;
  /** Hosted guest session. Same leaf as Copy / Fire. Never print. */
  bearer?: string;
};

/** Prove locally, or pay the hosted BFF with a Copy bearer. Never print keys, bearer, warrant, or proof. */
export async function warrantAct(
  url: string,
  body: string,
  deps: ActDeps,
): Promise<{ status: number; text: string }> {
  const bearer = deps.bearer?.trim() || process.env.WARRANT_BEARER?.trim();
  if (bearer) {
    return warrantPay(url, body, bearer, deps);
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
