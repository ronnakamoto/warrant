import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress } from "viem";
import { deskMessage } from "../src/lib/browser-wallet.ts";

const root = dirname(fileURLToPath(import.meta.url));
const WALLET = "0x00000000000000000000000000000000000000aB";
const NONCE = "ab".repeat(16);

describe("desk message", function () {
  it("matches the prove recover template", function () {
    assert.equal(deskMessage(WALLET, NONCE), `Warrant desk\n${getAddress(WALLET)}\n${NONCE}`);
  });

  it("is the only personal_sign payload in the wallet helper", function () {
    const src = readFileSync(join(root, "../src/lib/browser-wallet.ts"), "utf8");
    assert.match(src, /Warrant desk\\n\$\{/);
    assert.match(src, /export function deskMessage/);
    assert.match(src, /deskMessage\(wallet, nonce\)/);
    assert.equal(src.includes("@warrant/prove"), false);
    assert.equal(src.includes("services/prove"), false);
  });
});
