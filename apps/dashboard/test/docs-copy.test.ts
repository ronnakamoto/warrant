import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS_COPY, DOCS_DIAGRAMS } from "../src/lib/docs-copy.ts";

const root = dirname(fileURLToPath(import.meta.url));

describe("protocol docs", function () {
  it("speaks to someone who already has a bot", function () {
    assert.match(DOCS_COPY.lead, /bot/i);
    assert.match(DOCS_COPY.youHaveABot, /Grok|Hermes|OpenClaw/);
    assert.equal(/Hire an agent/i.test(DOCS_COPY.lead), false);
  });

  it("opens the machine after the feeling", function () {
    const book = Object.values(DOCS_COPY).join("\n");
    for (const word of ["Groth16", "LeanIMT", "nullifier", "epoch"]) {
      assert.equal(book.includes(word), true, word);
    }
    assert.match(book, /eight public signals|8 public/i);
    assert.match(book, /Warrant sees the witness/);
    assert.match(book, /shop sees a nullifier/i);
    assert.match(book, /HashScan/);
    assert.match(book, /tier=0|tier 0/);
    assert.match(book, /Not a World ID/i);
    assert.match(book, /ceremony/i);
    assert.match(book, /reverse proxy/i);
    assert.match(book, /createWarrantShop|@ronnakamoto\/warrant-x402/);
  });

  it("names the four diagrams", function () {
    assert.deepEqual(
      DOCS_DIAGRAMS.map((d) => d.title),
      ["The loop", "The chain", "Who sees what", "Fire"],
    );
  });

  it("does not sell a proxy or say npx", function () {
    const book = Object.values(DOCS_COPY).join("\n");
    assert.equal(book.includes("npx"), false);
    assert.equal(/ETHOnline|hi\.new/i.test(book), false);
  });

  it("does not import warrant-core from the docs route", function () {
    for (const rel of [
      "../src/app/docs/page.tsx",
      "../src/app/registry/page.tsx",
      "../src/components/ProtocolDocs.tsx",
      "../src/components/SiteChrome.tsx",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      assert.equal(src.includes("@ronnakamoto/warrant-core"), false, rel);
      assert.equal(src.includes("@warrant/core"), false, rel);
    }
  });
});
