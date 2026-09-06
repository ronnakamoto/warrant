import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentPrompt,
  GUEST_COPY,
  HEDERA_FAUCET,
  hashscanTestnetUrl,
  remainingLife,
  remainingMsUntil,
  shopIsDead,
} from "../src/lib/guest-copy.ts";
import {
  hederaPayFrom,
  hasHederaPrivateKey,
  parseGuestShopBody,
  parseShopBody,
  revokeEachLive,
  shopWithPaymentHeader,
  shopWithWarrant,
  translateForSession,
  confirmSessionCannotAct,
  txIdFromPaymentResponse,
} from "../src/lib/guest-act.ts";
import { hederaWalletPay, requirementsFromPaymentRequired } from "../src/lib/hedera-wallet-pay.ts";
import {
  guestCookie,
  deskCookie,
  deskFromCookie,
  sessionFromCookie,
  sessionFromBearer,
  clearGuestCookie,
  paymentRequiredFromResponse,
  guestOriginAllowed,
  publicGuestError,
  clientIpFromRequest,
  proveForwardHeaders,
  agentCorsHeaders,
} from "../src/lib/prove-client.ts";

describe("guest first-run copy", function () {
  it("keeps protocol words out of the land", function () {
    const land = `${GUEST_COPY.headline} ${GUEST_COPY.standfirst} ${GUEST_COPY.world} ${GUEST_COPY.authorize} ${GUEST_COPY.minting}`;
    for (const banned of ["merkle", "epoch", "zkey", "Groth16", "Baby Jubjub", "LeanIMT", "Free"]) {
      assert.equal(land.includes(banned), false, banned);
    }
  });

  it("does not put Registry in the land sentence", function () {
    const land = `${GUEST_COPY.headline} ${GUEST_COPY.standfirst} ${GUEST_COPY.authorize}`;
    assert.equal(/Registry/i.test(land), false);
  });

  it("is a warrant for an existing agent, not a hiring demo", function () {
    const land = `${GUEST_COPY.headline} ${GUEST_COPY.standfirst} ${GUEST_COPY.authorize}`;
    assert.equal(/Hire an agent/i.test(land), false);
    assert.equal(/Try it/i.test(land), false);
    assert.match(GUEST_COPY.authorize, /Authorize/i);
    const skill = agentPrompt("https://app.example", "tok_live_abc");
    assert.match(skill, /https:\/\/app\.example\/api\/agent\/translate/);
    assert.match(skill, /Authorization: Bearer tok_live_abc/);
    assert.match(skill, /open the tab and Fire/);
    assert.equal(skill.includes("127.0.0.1:8787"), false);
    assert.equal(skill.includes("hederaAccountId"), false);
    assert.equal(skill.includes("hederaPrivateKey"), false);
    assert.match(skill, /warrant act/);
    assert.match(skill, /warrant ready/);
    assert.match(skill, /I cannot sign Hedera from this chat/);
    assert.match(skill, /Do not POST a key/);
    assert.equal(/0x[0-9a-fA-F]{16,}/.test(skill), false);
  });

  it("reads the agent bearer and advertises CORS for bots", function () {
    assert.equal(sessionFromBearer("Bearer tok_live_abc"), "tok_live_abc");
    assert.equal(sessionFromBearer("tok_live_abc"), "tok_live_abc");
    assert.equal(sessionFromBearer(null), undefined);
    assert.equal(agentCorsHeaders()["Access-Control-Allow-Origin"], "*");
    assert.match(agentCorsHeaders()["Access-Control-Allow-Headers"] ?? "", /Authorization/i);
  });

  it("parses the session cookie", function () {
    const set = guestCookie("abc123", { NODE_ENV: "development" });
    assert.match(set, /HttpOnly/);
    assert.equal(set.includes("Secure"), false);
    assert.equal(sessionFromCookie(set), "abc123");
    assert.match(clearGuestCookie(), /Max-Age=0/);
  });

  it("reads guest and desk cookies independently", function () {
    const guest = guestCookie("abc123", { NODE_ENV: "development" });
    const desk = deskCookie("d".repeat(32), { NODE_ENV: "development" });
    const combined = `${guest}; ${desk.split(";")[0]}`;
    assert.equal(sessionFromCookie(combined), "abc123");
    assert.equal(deskFromCookie(combined), "d".repeat(32));
    assert.equal(sessionFromCookie(desk), undefined);
  });

  it("marks the session cookie Secure on the public host", function () {
    const set = guestCookie("abc123", { NODE_ENV: "production" });
    assert.match(set, /Secure/);
    assert.match(set, /HttpOnly/);
  });

  it("says plainly this is not a World ID check", function () {
    assert.match(GUEST_COPY.world, /World ID/i);
    assert.equal(/merkle|Groth16|zkey|epoch/i.test(GUEST_COPY.world), false);
    assert.match(GUEST_COPY.twoWallets, /MetaMask/);
    assert.match(GUEST_COPY.twoWallets, /HashPack/);
    assert.match(GUEST_COPY.twoWallets, /lets it pay/i);
    assert.match(GUEST_COPY.connectWallet, /You keep the key/);
  });

  it("pairs Let it spend through a fake listener and never posts a key", async function () {
    const { createServer } = await import("node:http");
    const { letSpendFromReady } = await import("../src/lib/hedera-purse.ts");
    let posted: unknown;
    const server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.method === "GET") {
        res.end(JSON.stringify({ ready: true, publicKey: "0".repeat(32) }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on("end", () => {
        posted = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        res.end(JSON.stringify({ publicKey: "0".repeat(32), accountId: "0.0.9", vaultAccountId: "0.0.8" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const granted = await letSpendFromReady({
      origin: `http://127.0.0.1:${port}`,
      grant: async (publicKey) => {
        assert.equal(publicKey, "0".repeat(32));
        assert.equal(/private|302e/i.test(publicKey), false);
        return { accountId: "0.0.9", vaultAccountId: "0.0.8" };
      },
    });
    assert.deepEqual(granted, { accountId: "0.0.9", vaultAccountId: "0.0.8" });
    assert.deepEqual(posted, { accountId: "0.0.9", vaultAccountId: "0.0.8" });
    assert.equal(JSON.stringify(posted).includes("privateKey"), false);
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it("falls back to purse bind when the listener will not pair", async function () {
    const { letSpendFromReady, PairFallbackError } = await import("../src/lib/hedera-purse.ts");
    const { createServer } = await import("node:http");
    const server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.method === "GET") {
        res.end(JSON.stringify({ ready: true, publicKey: "1".repeat(32) }));
        return;
      }
      res.statusCode = 500;
      res.end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    await assert.rejects(
      () =>
        letSpendFromReady({
          origin: `http://127.0.0.1:${port}`,
          grant: async () => ({ accountId: "0.0.9", vaultAccountId: "0.0.8" }),
        }),
      (err: unknown) => {
        assert.ok(err instanceof PairFallbackError);
        assert.equal(err.accountId, "0.0.9");
        assert.equal(err.vaultAccountId, "0.0.8");
        return true;
      },
    );
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  it("keeps the vault in HashPack and the spend cut separate from Fire", async function () {
    assert.match(GUEST_COPY.letSpend, /Let it spend/);
    assert.match(GUEST_COPY.cutSpend, /Cut spend/);
    assert.match(GUEST_COPY.spendGranted, /2 HBAR/);
    assert.equal(/private key|hederaPrivateKey/i.test(GUEST_COPY.letSpend), false);
    assert.match(agentPrompt("https://app.example", "tok"), /warrant ready/);
    assert.match(agentPrompt("https://app.example", "tok"), /I cannot sign Hedera from this chat/);
    const { parseAgentAccount, transactionIdFromExecute } = await import(
      "../src/lib/hedera-purse.ts"
    );
    assert.equal(parseAgentAccount(" 0.0.9 "), "0.0.9");
    assert.throws(() => parseAgentAccount("0xab"), /Hedera account/);
    assert.equal(transactionIdFromExecute({ transactionId: "0.0.9@1.2" }), "0.0.9@1.2");
  });

  it("does not keep a shop or hex pay fields on the console", function () {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../src/components/GuestTry.tsx"),
      "utf8",
    );
    assert.equal(src.includes("hederaPrivateKey"), false);
    assert.equal(src.includes("hederaAccountId"), false);
    assert.equal(src.includes('type="password"'), false);
    assert.equal(src.includes("/api/guest/translate"), false);
    assert.equal(src.includes("<textarea"), false);
    assert.equal(/Call the shop|Pay the shop|shopCall|payCall/.test(src), false);
    assert.match(src, /connectRootWallet/);
    assert.match(src, /Copy for my agent|copyPrompt/);
    const hashpack = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../src/lib/hedera-hashpack.ts"),
      "utf8",
    );
    assert.match(hashpack, /import\("@hiero-ledger\/sdk"\)/);
    assert.match(hashpack, /LedgerId\.TESTNET/);
    assert.match(src, /letSpendFromReady|Let it spend/);
    assert.match(src, /copiedOnce/);
    assert.match(src, /cutSpend/);
  });

  it("rejects cross-origin guest POSTs on the public host", function () {
    const req = new Request("https://app.example/api/guest", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    assert.equal(
      guestOriginAllowed(req, {
        NODE_ENV: "production",
        DASHBOARD_ORIGIN: "https://app.example",
      }),
      false,
    );
    assert.equal(
      guestOriginAllowed(
        new Request("https://app.example/api/guest", {
          method: "POST",
          headers: { origin: "https://app.example" },
        }),
        { NODE_ENV: "production", DASHBOARD_ORIGIN: "https://app.example" },
      ),
      true,
    );
  });

  it("hides host internals from the guest", function () {
    assert.equal(
      publicGuestError("PROVE_URL and PROVE_SECRET are required", { NODE_ENV: "production" }),
      GUEST_COPY.hostError,
    );
    assert.match(
      publicGuestError("PROVE_URL and PROVE_SECRET are required", { NODE_ENV: "development" }),
      /PROVE_URL/,
    );
  });

  it("forwards the browser IP and dashboard origin to the prove worker", function () {
    const req = new Request("https://app.example/api/guest", {
      method: "POST",
      headers: {
        origin: "https://app.example",
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      },
    });
    const hdrs = proveForwardHeaders(req);
    assert.equal(hdrs["x-warrant-client-ip"], "203.0.113.9");
    assert.equal(hdrs["x-warrant-dashboard-origin"], "https://app.example");
    assert.equal(clientIpFromRequest(req), "203.0.113.9");
  });

  it("forwards one origin on same-origin GET that has no Origin header", function () {
    const fromReferer = proveForwardHeaders(
      new Request("https://app.example/api/guest/warrants", {
        headers: { referer: "https://app.example/" },
      }),
      { DASHBOARD_ORIGIN: "https://app.example,https://other.example" },
    );
    assert.equal(fromReferer["x-warrant-dashboard-origin"], "https://app.example");

    const fromList = proveForwardHeaders(new Request("https://app.example/api/guest/warrants"), {
      DASHBOARD_ORIGIN: "https://app.example, https://other.example",
    });
    assert.equal(fromList["x-warrant-dashboard-origin"], "https://app.example");
    assert.equal(fromList["x-warrant-dashboard-origin"]?.includes(","), false);

    const fromUrl = proveForwardHeaders(
      new Request("https://warrant-beta.vercel.app/api/agent/translate"),
      {},
    );
    assert.equal(fromUrl["x-warrant-dashboard-origin"], "https://warrant-beta.vercel.app");

    const fromForwardedHost = proveForwardHeaders(
      new Request("https://warrant-n2pm2op0o-ronnakamotos-projects.vercel.app/api/agent/translate", {
        headers: {
          "x-forwarded-host": "warrant-beta.vercel.app",
          "x-forwarded-proto": "https",
        },
      }),
      { DASHBOARD_ORIGIN: "https://warrant-ronnakamotos-projects.vercel.app,https://warrant-beta.vercel.app" },
    );
    assert.equal(fromForwardedHost["x-warrant-dashboard-origin"], "https://warrant-beta.vercel.app");
  });

  it("tells the bot that Warrant sees the witness and the shop does not", function () {
    const skill = agentPrompt("https://app.example", "tok_live_abc");
    assert.match(skill, /Warrant will prove for you/);
    assert.match(skill, /witness/i);
    assert.match(skill, /nullifier/i);
    assert.equal(/fire every warrant on my desk/i.test(skill), false);
    assert.equal(skill.includes('"all":true'), false);
    assert.equal(/merkle|Groth16|zkey|Baby Jubjub/i.test(skill), false);
  });

  it("builds a HashScan link without showing the raw account", function () {
    const url = hashscanTestnetUrl("0.0.98@1788502420.541125170");
    assert.match(url, /hashscan\.io\/testnet\/transaction\//);
    assert.equal(HEDERA_FAUCET, "https://portal.hedera.com/faucet");
    assert.equal(shopIsDead(402), false);
    assert.equal(shopIsDead(403), true);
    assert.equal(shopIsDead(200), false);
  });

  it("does not put a shop or a key on the console land", function () {
    const land = `${GUEST_COPY.headline} ${GUEST_COPY.standfirst} ${GUEST_COPY.botLead} ${GUEST_COPY.copyPrompt}`;
    assert.equal(/402|private key|Call the shop|Pay the shop/i.test(land), false);
    assert.match(GUEST_COPY.botLead, /bot you already have/i);
    assert.match(GUEST_COPY.letSpend, /Let it spend/);
  });

  it("parses optional Hedera pay fields without requiring them", function () {
    assert.deepEqual(parseShopBody({ text: "hi" }), { text: "hi", source: "en", target: "es" });
    assert.deepEqual(
      parseShopBody({
        text: "hi",
        hederaAccountId: " 0.0.9 ",
        hederaPrivateKey: " 302e ",
      }),
      {
        text: "hi",
        source: "en",
        target: "es",
        hederaAccountId: "0.0.9",
        hederaPrivateKey: "302e",
      },
    );
    assert.equal(hederaPayFrom({ text: "hi", source: "en", target: "es" }), undefined);
    assert.deepEqual(
      hederaPayFrom({
        text: "hi",
        source: "en",
        target: "es",
        hederaAccountId: "0.0.9",
        hederaPrivateKey: "k",
      }),
      { accountId: "0.0.9", privateKey: "k" },
    );
  });

  it("guest parse rejects a private key and accepts a payment header", function () {
    assert.equal(hasHederaPrivateKey({ text: "hi", hederaPrivateKey: " 302e " }), true);
    assert.equal(parseGuestShopBody({ text: "hi", hederaPrivateKey: "302e" }), "private_key");
    assert.deepEqual(parseGuestShopBody({ text: "hi", payment: "  signed  " }), {
      text: "hi",
      source: "en",
      target: "es",
      payment: "signed",
    });
    assert.equal(
      "hederaPrivateKey" in (parseGuestShopBody({ text: "hi", hederaAccountId: "0.0.9" }) as object),
      false,
    );
  });

  it("encodes a payment header from a fake Hedera signer", async function () {
    const pr = {
      accepts: [
        {
          scheme: "exact",
          network: "hedera:testnet",
          amount: "100000",
          payTo: "0.0.1",
          extra: { feePayer: "0.0.2" },
        },
      ],
    };
    const requirements = requirementsFromPaymentRequired(pr);
    const header = await hederaWalletPay(
      {
        accountId: "0.0.9",
        createPartiallySignedTransferTransaction: async () => "dGVzdA==",
      },
      requirements,
    );
    assert.ok(header.length > 0);
    assert.equal(header.includes("302e"), false);
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
      payload?: { transaction?: string };
    };
    assert.equal(decoded.payload?.transaction, "dGVzdA==");
  });

  it("retries the shop with a payment header and never a private key", async function () {
    let sawKey = false;
    const res = await shopWithPaymentHeader(
      "http://shop.test/v1/translate",
      "{}",
      "warrant",
      "signed-header",
      async (_url, init) => {
        const headers = new Headers(init?.headers);
        if (headers.get("hederaPrivateKey") || JSON.stringify(init?.headers).includes("302e")) {
          sawKey = true;
        }
        assert.equal(headers.get("PAYMENT-SIGNATURE"), "signed-header");
        assert.equal(headers.get("warrant"), "warrant");
        return new Response(JSON.stringify({ text: "hola" }), { status: 200 });
      },
    );
    assert.equal(sawKey, false);
    assert.equal(res.status, 200);
  });

  it("proves after a signed payment header without using a Hedera key", async function () {
    let proved = 0;
    let paid = 0;
    const payload = {
      extensions: { warrant: { info: { nonce: "n", merkleRoot: "1" } } },
    };
    const headers = new Headers({
      "payment-required": Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    });
    const out = await translateForSession(
      "sess",
      { text: "hi", source: "en", target: "es", payment: "signed-header" },
      undefined,
      {
        translateUrl: "http://shop.test/v1/translate",
        fetchImpl: async (_url, init) => {
          const hdrs = new Headers(init?.headers);
          if (hdrs.get("PAYMENT-SIGNATURE") === "signed-header") {
            paid += 1;
            return new Response(JSON.stringify({ text: "hola" }), { status: 200 });
          }
          return new Response(JSON.stringify(payload), { status: 402, headers });
        },
        prove: async (path) => {
          if (path === "/v1/session") {
            return new Response(JSON.stringify({ status: "live" }), { status: 200 });
          }
          proved += 1;
          return new Response(JSON.stringify({ warrant: "w", nullifier: "n1" }), { status: 200 });
        },
        createPaymentFetch: () => {
          throw new Error("must not build a key signer");
        },
      },
    );
    assert.equal(proved, 1);
    assert.equal(paid, 1);
    assert.equal(out.status, 200);
    assert.equal(out.body.text, "hola");
  });

  it("reads a settle id from PAYMENT-RESPONSE when the body has none", function () {
    const headers = new Headers({
      "payment-response": Buffer.from(
        JSON.stringify({ transaction: "0.0.98@1788502420.541125170" }),
        "utf8",
      ).toString("base64"),
    });
    assert.equal(txIdFromPaymentResponse(headers), "0.0.98@1788502420.541125170");
    assert.equal(txIdFromPaymentResponse(headers, "body-wins"), "body-wins");
  });

  it("uses a payment fetch when the caller supplied a Hedera account", async function () {
    let paid = 0;
    const res = await shopWithWarrant(
      "http://shop.test/v1/translate",
      "{}",
      "warrant",
      { accountId: "0.0.9", privateKey: "k" },
      {
        createPaymentFetch: () => {
          return async () => {
            paid += 1;
            return new Response(JSON.stringify({ text: "hola", txId: "0.0.1@1.2" }), {
              status: 200,
            });
          };
        },
      },
    );
    assert.equal(paid, 1);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).txId, "0.0.1@1.2");
  });

  it("proves without pay only to confirm the shop is dead", async function () {
    let proved = 0;
    const payload = {
      extensions: { warrant: { info: { nonce: "n", merkleRoot: "1" } } },
    };
    const headers = new Headers({
      "payment-required": Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    });
    const dead = await confirmSessionCannotAct(
      "sess",
      { text: "hi", source: "en", target: "es" },
      undefined,
      {
        translateUrl: "http://shop.test/v1/translate",
        fetchImpl: async (_url, init) => {
          const warrant = new Headers(init?.headers).get("warrant");
          if (warrant) return new Response(JSON.stringify({ error: "root_revoked" }), { status: 403 });
          return new Response(JSON.stringify(payload), { status: 402, headers });
        },
        prove: async () => {
          proved += 1;
          return new Response(JSON.stringify({ warrant: "w" }), { status: 200 });
        },
      },
    );
    assert.equal(proved, 1);
    assert.equal(dead.status, 403);
    assert.equal(shopIsDead(dead.status), true);

    const live = await confirmSessionCannotAct(
      "sess",
      { text: "hi", source: "en", target: "es" },
      undefined,
      {
        translateUrl: "http://shop.test/v1/translate",
        fetchImpl: async () => new Response(JSON.stringify(payload), { status: 402, headers }),
        prove: async () => new Response(JSON.stringify({ warrant: "w" }), { status: 200 }),
      },
    );
    assert.equal(shopIsDead(live.status), false);
  });

  it("does not prove when the caller has not offered to pay", async function () {
    let proved = 0;
    const payload = {
      extensions: { warrant: { info: { nonce: "n", merkleRoot: "1" } } },
    };
    const headers = new Headers({
      "payment-required": Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    });
    const out = await translateForSession(
      "sess",
      { text: "hi", source: "en", target: "es" },
      undefined,
      {
        translateUrl: "http://shop.test/v1/translate",
        fetchImpl: async () => new Response(JSON.stringify(payload), { status: 402, headers }),
        prove: async (path) => {
          if (path === "/v1/session") {
            return new Response(JSON.stringify({ status: "live" }), { status: 200 });
          }
          proved += 1;
          return new Response("{}", { status: 500 });
        },
      },
    );
    assert.equal(proved, 0);
    assert.equal(out.status, 402);
    assert.equal(out.body.error, "pay");
  });

  it("returns 403 on an unpaid retry after the warrant is fired", async function () {
    let proved = 0;
    const payload = {
      extensions: { warrant: { info: { nonce: "n", merkleRoot: "1" } } },
    };
    const headers = new Headers({
      "payment-required": Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    });
    const out = await translateForSession(
      "sess",
      { text: "hi", source: "en", target: "es" },
      undefined,
      {
        translateUrl: "http://shop.test/v1/translate",
        fetchImpl: async () => new Response(JSON.stringify(payload), { status: 402, headers }),
        prove: async (path) => {
          if (path === "/v1/prove") proved += 1;
          return new Response(JSON.stringify({ status: "fired" }), { status: 200 });
        },
      },
    );
    assert.equal(proved, 0);
    assert.equal(out.status, 403);
    assert.equal(out.body.error, "root_revoked");
  });

  it("does not invent a payment fetch when the caller did not pay", async function () {
    let created = 0;
    const res = await shopWithWarrant(
      "http://shop.test/v1/translate",
      "{}",
      "warrant",
      undefined,
      {
        fetchImpl: async () => new Response(JSON.stringify({ error: "pay" }), { status: 402 }),
        createPaymentFetch: () => {
          created += 1;
          return fetch;
        },
      },
    );
    assert.equal(created, 0);
    assert.equal(res.status, 402);
  });

  it("names fire verbs without protocol words", function () {
    const words = `${GUEST_COPY.fireThis} ${GUEST_COPY.fireEvery} ${GUEST_COPY.fireOne} ${GUEST_COPY.helperFoot}`;
    for (const banned of ["merkle", "epoch", "zkey", "Groth16", "deskId"]) {
      assert.equal(words.includes(banned), false, banned);
    }
  });

  it("speaks remaining life in days or minutes", function () {
    assert.equal(remainingLife(7 * 86_400_000), "7 days left");
    assert.equal(remainingLife(29 * 60 * 1000), "29 minutes left");
    assert.equal(remainingLife(40_000), "Less than a minute left");
    assert.equal(remainingLife(0), "This warrant has expired");
  });

  it("recomputes remaining life from an expiry instant", function () {
    const now = 1_000_000;
    assert.equal(remainingMsUntil(now + 5_000, now), 5_000);
    assert.equal(remainingMsUntil(now - 1, now), 0);
  });

  it("continues fire-all after one live revoke fails", async function () {
    const seen: string[] = [];
    const out = await revokeEachLive(
      [
        { id: "fired", status: "fired" },
        { id: "a", status: "live" },
        { id: "b", status: "live" },
        { id: "c", status: "live" },
      ],
      async (id) => {
        seen.push(id);
        if (id === "b") return { ok: false };
        return { ok: true, txHash: `0x${id}` };
      },
    );
    assert.deepEqual(seen, ["a", "b", "c"]);
    assert.deepEqual(out.txHashes, ["0xa", "0xc"]);
    assert.equal(out.failed, 1);
  });

  it("reads a warrant challenge from the payment-required header", function () {
    const payload = {
      extensions: { warrant: { info: { nonce: "abc", merkleRoot: "1" } } },
    };
    const headers = new Headers({
      "payment-required": Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    });
    const pr = paymentRequiredFromResponse(headers, {});
    assert.equal(
      (pr?.extensions as { warrant?: { info?: { nonce?: string } } })?.warrant?.info?.nonce,
      "abc",
    );
  });
});
