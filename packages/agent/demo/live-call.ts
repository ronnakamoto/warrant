/**
 * Live Base Sepolia + translate call helper.
 *
 * Real Groth16 by default (needs circuits/build zkey).
 * ALLOW_DEMO_VERIFY=1 + WARRANT_REAL_PROVE=0 → fake proof bytes.
 * WARRANT_PAY=1 → settle quota-exhausted 402 via Blocky402 / ExactHedera
 *   (requires HEDERA_PAY_TO ≠ HEDERA_ACCOUNT_ID).
 */
import { x402Client } from "@x402/fetch";
import { wrapFetchWithPayment } from "@x402/fetch";
import {
  createClientHederaSigner,
  ExactHederaScheme,
  PrivateKey,
} from "@x402/hedera";
import type { IProver, WarrantProof } from "@warrant/core";
import { warrantFetch } from "../src/fetch.ts";
import { createSnarkjsProver } from "../src/prover.ts";
import { loadState } from "../src/store.ts";

const fake: IProver = {
  async prove(): Promise<WarrantProof> {
    return { pi_a: ["0"], pi_b: [["0"]], pi_c: ["0"] };
  },
};

function paymentFetchFromEnv(): typeof globalThis.fetch | undefined {
  if (process.env.WARRANT_PAY !== "1") return undefined;
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const keyRaw = process.env.HEDERA_PRIVATE_KEY;
  const payTo = process.env.HEDERA_PAY_TO;
  if (!accountId || !keyRaw) {
    throw new Error("WARRANT_PAY=1 needs HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY");
  }
  if (!payTo || payTo === accountId) {
    throw new Error("WARRANT_PAY=1 needs HEDERA_PAY_TO distinct from HEDERA_ACCOUNT_ID");
  }
  const key = keyRaw.startsWith("0x")
    ? PrivateKey.fromStringECDSA(keyRaw)
    : PrivateKey.fromString(keyRaw);
  const signer = createClientHederaSigner(accountId, key, {
    network: "hedera:testnet",
  });
  const client = x402Client.fromConfig({
    schemes: [{ network: "hedera:*", client: new ExactHederaScheme(signer) }],
    spendControls: false,
  });
  return wrapFetchWithPayment(globalThis.fetch, client);
}

function proverFromEnv(): IProver {
  const demoVerify = process.env.ALLOW_DEMO_VERIFY === "1";
  const real = process.env.WARRANT_REAL_PROVE !== "0";
  if (!real && demoVerify) return fake;
  if (!real) {
    throw new Error("fake prove needs ALLOW_DEMO_VERIFY=1; otherwise omit WARRANT_REAL_PROVE=0");
  }
  return createSnarkjsProver();
}

async function main() {
  const storePath = process.env.WARRANT_STORE;
  if (!storePath) throw new Error("set WARRANT_STORE");
  const state = loadState(storePath);
  const body = JSON.stringify({ text: process.env.TRANSLATE_TEXT ?? "live base sepolia" });
  const paymentFetch = paymentFetchFromEnv();
  const prover = proverFromEnv();
  const res = await warrantFetch(
    process.env.TRANSLATE_URL ?? "http://127.0.0.1:8787/v1/translate",
    { method: "POST", headers: { "content-type": "application/json" }, body },
    {
      as: "translator",
      state,
      storePath,
      prover,
      paymentFetch,
      payTo: process.env.HEDERA_PAY_TO ?? process.env.HEDERA_ACCOUNT_ID,
    },
  );
  const paymentRequired =
    res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required");
  console.log(
    JSON.stringify(
      {
        status: res.status,
        body: (await res.text()).slice(0, 500),
        paymentRequired: paymentRequired ? paymentRequired.slice(0, 120) + "…" : null,
        paid: process.env.WARRANT_PAY === "1",
        realProve: process.env.WARRANT_REAL_PROVE !== "0",
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
