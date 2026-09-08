import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, stringToBytes } from "viem";
import { memoForSession, parseGuestMemoBody } from "../src/lib/guest-act.ts";
import { hashMemoBody, proveConfig } from "../src/lib/prove-client.ts";

describe("guest memo BFF", function () {
  it("rejects a Hedera private key on memo", function () {
    assert.equal(parseGuestMemoBody({ text: "hi", hederaPrivateKey: "302e" }), "private_key");
  });

  it("rejects empty or too_long memo text before prove", function () {
    assert.equal(parseGuestMemoBody({ text: "" }), "empty");
    assert.equal(parseGuestMemoBody({ text: "   " }), "empty");
    assert.equal(parseGuestMemoBody({ text: "x".repeat(241) }), "too_long");
    assert.deepEqual(parseGuestMemoBody({ text: "hi" }), { text: "hi" });
  });

  it("returns 403 on an unpaid retry after the warrant is fired", async function () {
    let proved = 0;
    const payload = {
      extensions: { warrant: { info: { nonce: "n", merkleRoot: "1" } } },
    };
    const headers = new Headers({
      "payment-required": Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    });
    const out = await memoForSession(
      "sess",
      { text: "hi" },
      undefined,
      {
        memoUrl: "http://shop.test/v1/memo",
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

  it("returns 400 when the memo body includes a private key", async function () {
    const { POST } = await import("../src/app/api/agent/memo/route.ts");
    const res = await POST(
      new Request("https://app.example/api/agent/memo", {
        method: "POST",
        headers: {
          authorization: "Bearer tok",
          "content-type": "application/json",
        },
        body: JSON.stringify({ text: "hi", hederaPrivateKey: "302e" }),
      }),
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "private key not allowed");
  });

  it("returns 400 for empty memo text without proving", async function () {
    const { POST } = await import("../src/app/api/agent/memo/route.ts");
    const res = await POST(
      new Request("https://app.example/api/agent/memo", {
        method: "POST",
        headers: {
          authorization: "Bearer tok",
          "content-type": "application/json",
        },
        body: JSON.stringify({ text: "" }),
      }),
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "empty");
  });

  it("returns 400 for too-long memo text without proving", async function () {
    const { POST } = await import("../src/app/api/agent/memo/route.ts");
    const res = await POST(
      new Request("https://app.example/api/agent/memo", {
        method: "POST",
        headers: {
          authorization: "Bearer tok",
          "content-type": "application/json",
        },
        body: JSON.stringify({ text: "x".repeat(241) }),
      }),
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "too_long");
  });

  it("returns 401 when the memo call has no bearer", async function () {
    const { POST } = await import("../src/app/api/agent/memo/route.ts");
    const res = await POST(
      new Request("https://app.example/api/agent/memo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "hi" }),
      }),
    );
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "missing bearer");
  });

  it("hashes memo body as keccak of JSON { text }", function () {
    assert.equal(hashMemoBody("hi"), keccak256(stringToBytes(JSON.stringify({ text: "hi" }))));
  });

  it("adds memoUrl without breaking translateUrl", function () {
    const prev = {
      PROVE_URL: process.env.PROVE_URL,
      PROVE_SECRET: process.env.PROVE_SECRET,
      TRANSLATE_URL: process.env.TRANSLATE_URL,
      MEMO_URL: process.env.MEMO_URL,
    };
    process.env.PROVE_URL = "http://prove.test";
    process.env.PROVE_SECRET = "s";
    delete process.env.TRANSLATE_URL;
    delete process.env.MEMO_URL;
    try {
      const cfg = proveConfig();
      assert.equal(cfg.memoUrl, "http://127.0.0.1:8789/v1/memo");
      assert.equal(cfg.translateUrl, "http://127.0.0.1:8787/v1/translate");
      process.env.MEMO_URL = "http://memo.test/v1/memo";
      const next = proveConfig();
      assert.equal(next.memoUrl, "http://memo.test/v1/memo");
      assert.equal(next.translateUrl, "http://127.0.0.1:8787/v1/translate");
    } finally {
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("records a receipt after shop 200 and still returns 200 if receipt fails", async function () {
    const hashscan = "https://hashscan.io/testnet/transaction/0.0.10416077-1-000000000";
    const payload = {
      extensions: { warrant: { info: { nonce: "n", merkleRoot: "1" } } },
    };
    const headers = new Headers({
      "payment-required": Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    });
    const receipts: unknown[] = [];
    const out = await memoForSession(
      "sess",
      { text: "hi", payment: "sig" },
      undefined,
      {
        memoUrl: "http://shop.test/v1/memo",
        fetchImpl: async (_url, init) => {
          const h = new Headers(init?.headers);
          if (h.get("warrant") && h.get("PAYMENT-SIGNATURE")) {
            return new Response(JSON.stringify({ text: "hi", hashscan }), { status: 200 });
          }
          return new Response(JSON.stringify(payload), { status: 402, headers });
        },
        prove: async (path, body) => {
          if (path === "/v1/session") {
            return new Response(JSON.stringify({ status: "live" }), { status: 200 });
          }
          if (path === "/v1/prove") {
            return new Response(JSON.stringify({ warrant: "w", nullifier: "42" }), { status: 200 });
          }
          if (path === "/v1/receipt") {
            receipts.push(body);
            return new Response("nope", { status: 500 });
          }
          return new Response("{}", { status: 500 });
        },
      },
    );
    assert.equal(out.status, 200);
    assert.equal(out.body.hashscan, hashscan);
    assert.deepEqual(receipts, [{ sessionId: "sess", hashscan, nullifier: "42" }]);
    assert.equal("warrant" in out.body, false);
  });

  it("does not record a receipt on an unpaid 402", async function () {
    let receipts = 0;
    const payload = {
      extensions: { warrant: { info: { nonce: "n", merkleRoot: "1" } } },
    };
    const headers = new Headers({
      "payment-required": Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    });
    const out = await memoForSession(
      "sess",
      { text: "hi" },
      undefined,
      {
        memoUrl: "http://shop.test/v1/memo",
        fetchImpl: async () => new Response(JSON.stringify(payload), { status: 402, headers }),
        prove: async (path) => {
          if (path === "/v1/receipt") receipts += 1;
          return new Response(JSON.stringify({ status: "live" }), { status: 200 });
        },
      },
    );
    assert.equal(out.status, 402);
    assert.equal(receipts, 0);
  });

  it("does not import warrant-core from the memo route", function () {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../src/app/api/agent/memo/route.ts"),
      "utf8",
    );
    assert.equal(src.includes("@ronnakamoto/warrant-core"), false);
    assert.match(src, /agentCorsHeaders/);
    assert.match(src, /memoForSession/);
  });
});
