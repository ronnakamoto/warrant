import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hireForSession, translateForSession } from "../src/lib/guest-act.ts";

describe("guest hire BFF", function () {
  it("returns a helper skill and does not call hire when the bearer is already a helper", async function () {
    let hired = 0;
    const out = await hireForSession("parent", undefined, {
      prove: async (path, body) => {
        if (path === "/v1/session") {
          return new Response(JSON.stringify({ status: "live" }), { status: 200 });
        }
        if (path === "/v1/hire") {
          hired += 1;
          assert.deepEqual(body, { sessionId: "parent" });
          return new Response(JSON.stringify({ helperSessionId: "child" }), { status: 200 });
        }
        return new Response("{}", { status: 500 });
      },
    }, "https://app.example");
    assert.equal(out.status, 200);
    assert.equal(typeof out.body.skill, "string");
    assert.match(String(out.body.skill), /https:\/\/app\.example\/api\/agent\/memo/);
    assert.match(String(out.body.skill), /Bearer child/);
    assert.equal(String(out.body.skill).includes("/api/agent/hire"), false);
    assert.equal("bearer" in out.body, false);
    assert.equal(hired, 1);

    let hiredAgain = 0;
    const helper = await hireForSession("child", undefined, {
      prove: async (path) => {
        if (path === "/v1/session") {
          return new Response(JSON.stringify({ status: "live", parentId: "parent" }), { status: 200 });
        }
        if (path === "/v1/hire") hiredAgain += 1;
        return new Response("{}", { status: 500 });
      },
    });
    assert.equal(helper.status, 403);
    assert.equal(helper.body.error, "scope");
    assert.equal(hiredAgain, 0);
  });

  it("maps fired and unknown without creating a helper", async function () {
    const fired = await hireForSession("p", undefined, {
      prove: async () => new Response(JSON.stringify({ status: "fired" }), { status: 200 }),
    });
    assert.equal(fired.status, 403);
    assert.equal(fired.body.error, "root_revoked");

    const missing = await hireForSession("p", undefined, {
      prove: async () => new Response(JSON.stringify({ error: "unknown session" }), { status: 404 }),
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, "unknown session");
  });

  it("returns 403 scope on translate for a helper without proving", async function () {
    let proved = 0;
    let fetched = 0;
    const out = await translateForSession(
      "child",
      { text: "hi", source: "en", target: "es" },
      undefined,
      {
        translateUrl: "http://shop.test/v1/translate",
        fetchImpl: async () => {
          fetched += 1;
          return new Response("{}", { status: 500 });
        },
        prove: async (path) => {
          if (path === "/v1/prove") proved += 1;
          return new Response(JSON.stringify({ status: "live", parentId: "parent" }), { status: 200 });
        },
      },
    );
    assert.equal(out.status, 403);
    assert.equal(out.body.error, "scope");
    assert.equal(proved, 0);
    assert.equal(fetched, 0);
  });

  it("returns 403 scope on translate for a fetch parent without proving", async function () {
    let proved = 0;
    let fetched = 0;
    const out = await translateForSession(
      "parent",
      { text: "hi", source: "en", target: "es" },
      undefined,
      {
        translateUrl: "http://shop.test/v1/translate",
        fetchImpl: async () => {
          fetched += 1;
          return new Response("{}", { status: 500 });
        },
        prove: async (path) => {
          if (path === "/v1/prove") proved += 1;
          return new Response(JSON.stringify({ status: "live", scope: "fetch" }), { status: 200 });
        },
      },
    );
    assert.equal(out.status, 403);
    assert.equal(out.body.error, "scope");
    assert.equal(proved, 0);
    assert.equal(fetched, 0);
  });

  it("returns 403 scope on hire for a translate parent without hiring", async function () {
    let hired = 0;
    const out = await hireForSession("parent", undefined, {
      prove: async (path) => {
        if (path === "/v1/session") {
          return new Response(JSON.stringify({ status: "live", scope: "translate" }), { status: 200 });
        }
        if (path === "/v1/hire") hired += 1;
        return new Response("{}", { status: 500 });
      },
    });
    assert.equal(out.status, 403);
    assert.equal(out.body.error, "scope");
    assert.equal(hired, 0);
  });

  it("forwards mint scope and 400s an invalid string without minting", async function () {
    const wallet = "0x1111111111111111111111111111111111111111";
    const prev = {
      PROVE_URL: process.env.PROVE_URL,
      PROVE_SECRET: process.env.PROVE_SECRET,
      TURNSTILE_SECRET: process.env.TURNSTILE_SECRET,
    };
    process.env.PROVE_URL = "http://prove.test";
    process.env.PROVE_SECRET = "s";
    delete process.env.TURNSTILE_SECRET;
    const origFetch = globalThis.fetch;
    const minted: unknown[] = [];
    globalThis.fetch = async (input, init) => {
      if (String(input).includes("/v1/mint")) {
        minted.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(
          JSON.stringify({ sessionId: "s1", wallet, deskId: "desk1" }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 500 });
    };
    try {
      const { POST } = await import("../src/app/api/guest/route.ts");
      const bad = await POST(
        new Request("https://app.example/api/guest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet, scope: "nope" }),
        }),
      );
      assert.equal(bad.status, 400);
      assert.deepEqual(await bad.json(), { error: "invalid scope" });
      assert.equal(minted.length, 0);

      const forwarded = await POST(
        new Request("https://app.example/api/guest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet, scope: "translate" }),
        }),
      );
      assert.equal(forwarded.status, 200);
      assert.equal((minted[0] as { scope?: string }).scope, "translate");

      minted.length = 0;
      const omitted = await POST(
        new Request("https://app.example/api/guest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet }),
        }),
      );
      assert.equal(omitted.status, 200);
      assert.equal("scope" in (minted[0] as object), false);
    } finally {
      globalThis.fetch = origFetch;
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("returns 401 without a bearer and does not import warrant-core", async function () {
    const { POST } = await import("../src/app/api/agent/hire/route.ts");
    const res = await POST(
      new Request("https://app.example/api/agent/hire", { method: "POST" }),
    );
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "missing bearer");
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../src/app/api/agent/hire/route.ts"),
      "utf8",
    );
    assert.equal(src.includes("@ronnakamoto/warrant-core"), false);
    assert.equal(src.includes("@warrant/core"), false);
  });
});
