import { x402ResourceServer } from "@x402/core/server";
import { x402HTTPResourceServer } from "@x402/core/http";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function adapter(headers = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    getHeader: (name) => h[name.toLowerCase()],
    getMethod: () => "POST",
    getPath: () => "/v1/translate",
    getUrl: () => "https://translate.warrant.example/v1/translate",
    getAcceptHeader: () => "application/json",
    getUserAgent: () => "warrant-spike",
  };
}

const server = new x402ResourceServer("https://api.testnet.blocky402.com");
const http = new x402HTTPResourceServer(server, {
  "POST /v1/translate": {
    accepts: {
      scheme: "exact",
      network: "hedera:testnet",
      asset: "0.0.0",
      amount: "100000",
      payTo: "0.0.10311260",
      maxTimeoutSeconds: 300,
      extra: { feePayer: "0.0.7162784" },
    },
    description: "translate",
    extensions: { warrant: { info: { version: "1" } } },
  },
});

http.onProtectedRequest(async (context) => {
  const header = context.adapter.getHeader("warrant");
  if (!header) return;
  if (header === "revoked") {
    return { abort: true, reason: "root_revoked" };
  }
  if (header === "valid-free") {
    return { grantAccess: true };
  }
  if (header === "valid-paid") {
    return;
  }
});

async function run(label, headers) {
  const result = await http.processHTTPRequest({
    adapter: adapter(headers),
    path: "/v1/translate",
    method: "POST",
  });
  return { label, type: result.type, status: result.response?.status, reason: result.response?.body };
}

const cases = [];
cases.push(await run("no-header", {}));
cases.push(await run("free-warrant", { warrant: "valid-free" }));
cases.push(await run("paid-warrant", { warrant: "valid-paid" }));
cases.push(await run("revoked", { warrant: "revoked" }));

const result = {
  agentkitPattern:
    "createAgentkitHooks.requestHook returns { grantAccess: true }; wire via http.onProtectedRequest (or transportHooks.http.onProtectedRequest). Missing header is void → 402, not skip-on-verify.",
  planCorrection:
    "Do not use onBeforeVerify { skip: true } for the free tier. AgentKit free mode never enters verify/settle. Warrant: valid+under-quota → grantAccess; valid+exhausted → void (402/pay); revoked/invalid → abort 403; missing header → void so the client sees 402 with extensions.warrant.",
  cases,
  grantAccessIsNoPayment: cases.find((c) => c.label === "free-warrant")?.type === "no-payment-required",
  revokedIs403: cases.find((c) => c.label === "revoked")?.type === "payment-error" && cases.find((c) => c.label === "revoked")?.status === 403,
};

writeFileSync(join(here, "grant-access-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
