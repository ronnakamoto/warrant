import assert from "node:assert/strict";
import { agentPrompt, GUEST_COPY } from "../src/lib/guest-copy.ts";
import {
  guestCookie,
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
    for (const banned of ["merkle", "epoch", "zkey", "Groth16", "Baby Jubjub", "LeanIMT"]) {
      assert.equal(land.includes(banned), false, banned);
    }
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
