import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deskCookie, deskFromCookie, sessionFromCookie } from "../src/lib/prove-client.ts";

describe("desk cookie", function () {
  it("round-trips desk id and stays HttpOnly", function () {
    const set = deskCookie("d".repeat(32), { NODE_ENV: "development" });
    assert.match(set, /warrant_desk=/);
    assert.match(set, /HttpOnly/);
    assert.equal(set.includes("Secure"), false);
    assert.equal(deskFromCookie(set), "d".repeat(32));
    assert.equal(sessionFromCookie(set), undefined);
  });

  it("is Secure on the public host", function () {
    assert.match(deskCookie("d".repeat(32), { NODE_ENV: "production" }), /Secure/);
  });
});

describe("agent revoke gate", function () {
  it("stays bearer-only and cannot fire the whole desk", function () {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const src = readFileSync(join(root, "src/app/api/agent/revoke/route.ts"), "utf8");
    assert.equal(src.includes("all:"), false);
    assert.equal(src.includes("all === true"), false);
    assert.match(src, /sessionFromBearer/);
  });
});
