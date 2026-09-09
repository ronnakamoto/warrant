import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function withProveStub(
  fetchImpl: typeof fetch,
): { restore: () => void } {
  const prev = {
    PROVE_URL: process.env.PROVE_URL,
    PROVE_SECRET: process.env.PROVE_SECRET,
  };
  process.env.PROVE_URL = "http://prove.test";
  process.env.PROVE_SECRET = "s";
  const origFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  return {
    restore() {
      globalThis.fetch = origFetch;
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

describe("guest warrants BFF", function () {
  it("POST /api/guest/warrants sets the desk cookie after recover", async function () {
    const stub = withProveStub(async (input) => {
      if (String(input).includes("/v1/desk-recover")) {
        return new Response(
          JSON.stringify({
            deskId: "aa..",
            warrants: [{ id: "s1", status: "live" }],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 500 });
    });
    try {
      const { POST } = await import("../src/app/api/guest/warrants/route.ts");
      const res = await POST(new Request("http://127.0.0.1/api/guest/warrants", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
        body: JSON.stringify({ wallet: "0x00000000000000000000000000000000000000ab", nonce: "n", signature: "0x1" }),
      }));
      assert.equal(res.status, 200);
      assert.match(res.headers.get("set-cookie") ?? "", /warrant_desk=/);
    } finally {
      stub.restore();
    }
  });

  it("POST /api/guest/challenge returns a nonce", async function () {
    const stub = withProveStub(async (input) => {
      if (String(input).includes("/v1/desk-challenge")) {
        return new Response(
          JSON.stringify({ nonce: "n1", expiresAt: 1_700_000_000_000 }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 500 });
    });
    try {
      const { POST } = await import("../src/app/api/guest/challenge/route.ts");
      const res = await POST(
        new Request("http://127.0.0.1/api/guest/challenge", { method: "POST" }),
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as { nonce?: unknown };
      assert.equal(typeof body.nonce, "string");
      assert.ok(body.nonce);
    } finally {
      stub.restore();
    }
  });

  it("POST /api/guest/warrants 400s a missing signature without recover", async function () {
    let recovered = 0;
    const stub = withProveStub(async (input) => {
      if (String(input).includes("/v1/desk-recover")) {
        recovered += 1;
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 500 });
    });
    try {
      const { POST } = await import("../src/app/api/guest/warrants/route.ts");
      const res = await POST(
        new Request("http://127.0.0.1/api/guest/warrants", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wallet: "0x00000000000000000000000000000000000000ab",
            nonce: "n",
          }),
        }),
      );
      assert.equal(res.status, 400);
      assert.equal(recovered, 0);
    } finally {
      stub.restore();
    }
  });

  it("GET /api/guest/warrants still lists by warrant_desk cookie", async function () {
    const called: unknown[] = [];
    const stub = withProveStub(async (input, init) => {
      if (String(input).includes("/v1/desk")) {
        called.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(
          JSON.stringify({ warrants: [{ id: "s1", status: "live" }] }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 500 });
    });
    try {
      const { GET } = await import("../src/app/api/guest/warrants/route.ts");
      const res = await GET(
        new Request("http://127.0.0.1/api/guest/warrants", {
          headers: { cookie: "warrant_desk=aa.." },
        }),
      );
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { warrants: [{ id: "s1", status: "live" }] });
      assert.deepEqual(called, [{ deskId: "aa.." }]);
    } finally {
      stub.restore();
    }
  });

  it("does not import warrant-core from guest challenge or warrants routes", function () {
    for (const rel of [
      "../src/app/api/guest/challenge/route.ts",
      "../src/app/api/guest/warrants/route.ts",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      assert.equal(src.includes("@ronnakamoto/warrant-core"), false);
      assert.equal(src.includes("@warrant/core"), false);
    }
  });
});
