import assert from "node:assert/strict";
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
  parseShopBody,
  revokeEachLive,
  shopWithWarrant,
  translateForSession,
  txIdFromPaymentResponse,
} from "../src/lib/guest-act.ts";
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
    assert.match(skill, /\/api\/agent\/revoke/);
    assert.equal(skill.includes("127.0.0.1:8787"), false);
    assert.match(skill, /hederaAccountId/);
    assert.match(skill, /portal\.hedera\.com\/faucet/);
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
    assert.equal(GUEST_COPY.paidFoot.includes("nullifier"), true);
  });

  it("does not put the paywall or the key in the first shop sentence", function () {
    assert.equal(/402|private key|HBAR/i.test(GUEST_COPY.shopLead), false);
    assert.match(GUEST_COPY.botLead, /bot you already have/i);
    assert.match(GUEST_COPY.payHint, /does not keep the key/i);
    assert.equal(/402/i.test(GUEST_COPY.payHint), false);
  });

  it("asks for a real Hedera pay, not a free quota", function () {
    assert.equal(/Free calls/i.test(GUEST_COPY.quota), false);
    assert.match(GUEST_COPY.quota, /testnet HBAR/i);
    assert.equal(HEDERA_FAUCET, "https://portal.hedera.com/faucet");
    assert.equal(shopIsDead(402), false);
    assert.equal(shopIsDead(403), true);
    assert.equal(shopIsDead(200), false);
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
        prove: async () => {
          proved += 1;
          return new Response("{}", { status: 500 });
        },
      },
    );
    assert.equal(proved, 0);
    assert.equal(out.status, 402);
    assert.equal(out.body.error, "pay");
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

  it("speaks remaining life in minutes", function () {
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
