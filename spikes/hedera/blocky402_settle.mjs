import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { x402Client } from "@x402/core/client";
import { HTTPFacilitatorClient } from "@x402/core/http";
import {
  ExactHederaScheme,
  createClientHederaSigner,
  PrivateKey,
  HBAR_ASSET_ID,
} from "@x402/hedera";
import { loadEnvFile } from "../lib/load-env.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");
loadEnvFile(join(repoRoot, ".env"));
loadEnvFile(join(here, ".env"));

const FACILITATOR = "https://api.testnet.blocky402.com";
const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";
const accountId = process.env.HEDERA_ACCOUNT_ID;
const privateKeyHex = process.env.HEDERA_PRIVATE_KEY;

if (!accountId || !privateKeyHex) {
  console.error("Need HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env");
  process.exit(2);
}

const payTo = "0.0.98";
const amount = "1000"; // tinybars — 0.00001 HBAR
const feePayer = "0.0.7162784";

const supported = await fetch(`${FACILITATOR}/supported`).then((r) => r.json());
const hederaKind = supported.kinds.find((k) => k.network === "hedera:testnet");

const signer = createClientHederaSigner(accountId, PrivateKey.fromStringECDSA(privateKeyHex), {
  network: "hedera:testnet",
});
const client = new x402Client().setSpendControls(false);
client.register("hedera:*", new ExactHederaScheme(signer));

const paymentRequired = {
  x402Version: 2,
  resource: {
    url: "https://translate.warrant.example/v1/translate",
    description: "warrant spike settle",
  },
  accepts: [
    {
      scheme: "exact",
      network: "hedera:testnet",
      asset: HBAR_ASSET_ID,
      amount,
      payTo,
      maxTimeoutSeconds: 300,
      extra: { feePayer: hederaKind?.extra?.feePayer ?? feePayer },
    },
  ],
};

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR, timeoutMs: 60_000 });

let payloadError = null;
let payload = null;
try {
  payload = await client.createPaymentPayload(paymentRequired);
} catch (err) {
  payloadError = err.message || String(err);
}

const selected = paymentRequired.accepts[0];
let verify = null;
let verifyError = null;
if (payload) {
  try {
    verify = await facilitator.verify(payload, selected);
  } catch (err) {
    verifyError = {
      message: err.message || String(err),
      status: err.status,
      data: err.data ?? err.response ?? undefined,
    };
  }
}

let settle = null;
let settleError = null;
if (payload && verify?.isValid) {
  try {
    settle = await facilitator.settle(payload, selected);
  } catch (err) {
    settleError = {
      message: err.message || String(err),
      status: err.status,
      data: err.data ?? err.response ?? undefined,
    };
  }
}

const txId = settle?.transaction;
const txIdDash = txId ? String(txId).replace("@", "-").replace(/\.(?=\d+$)/, "-") : null;
let mirrorTx = null;
if (txIdDash) {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`${MIRROR}/transactions/${encodeURIComponent(txIdDash)}`);
    if (res.ok) {
      mirrorTx = await res.json();
      const status = mirrorTx?.transactions?.[0]?.result ?? mirrorTx?.result;
      if (status) break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const firstTx = mirrorTx?.transactions?.[0];
const result = {
  ok: settle?.success === true,
  accountId,
  payTo,
  amountTinybars: amount,
  asset: HBAR_ASSET_ID,
  feePayer: selected.extra.feePayer,
  facilitator: FACILITATOR,
  supportedHedera: hederaKind,
  payloadError,
  payloadHasTransaction: Boolean(payload?.payload?.transaction),
  x402Version: payload?.x402Version ?? null,
  verify,
  verifyError,
  settle,
  settleError,
  transactionId: txId ?? null,
  hashscan: txIdDash ? `https://hashscan.io/testnet/transaction/${txIdDash}` : null,
  mirrorStatus: firstTx?.result ?? null,
  mirrorName: firstTx?.name ?? null,
  transfers: firstTx?.transfers ?? null,
};

writeFileSync(join(here, "blocky402-settle-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
