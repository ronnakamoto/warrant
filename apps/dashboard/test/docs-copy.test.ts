import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS_COPY, DOCS_DIAGRAMS, DOCS_EXCALIDRAW, docsBookText } from "../src/lib/docs-copy.ts";

const root = dirname(fileURLToPath(import.meta.url));

describe("protocol docs", function () {
  it("speaks to someone who already has a bot", function () {
    assert.match(DOCS_COPY.lead, /bot/i);
    assert.match(DOCS_COPY.youHaveABot, /Grok|Hermes|OpenClaw/);
    assert.equal(/Hire an agent/i.test(DOCS_COPY.lead), false);
  });

  it("opens the machine after the feeling", function () {
    const book = docsBookText();
    for (const word of ["Groth16", "LeanIMT", "nullifier", "epoch"]) {
      assert.equal(book.includes(word), true, word);
    }
    assert.match(book, /eight public signals|8 public|publicSignals/i);
    assert.match(book, /Warrant sees the witness/);
    assert.match(book, /shop sees a nullifier/i);
    assert.match(book, /HashScan/);
    assert.match(book, /tier=0|tier 0/);
    assert.match(book, /Not a World ID/i);
    assert.match(book, /ceremony/i);
    assert.match(book, /reverse proxy/i);
    assert.match(book, /createWarrantShop|@ronnakamoto\/warrant-x402/);
  });

  it("details the cryptography and circuit that shops verify", function () {
    const book = docsBookText();
    for (const word of [
      "Baby Jubjub",
      "EdDSA-Poseidon",
      "Poseidon",
      "BN254",
      "WarrantFull",
      "BinaryMerkleRoot",
      "humanTag",
      "contextHash",
      "requestHash",
      "keccak256",
      "currentRoot",
      "ExactHedera",
    ]) {
      assert.equal(book.includes(word), true, word);
    }
    assert.match(book, /warrant\/leaf/);
    assert.match(book, /warrant\/mandate/);
    assert.match(book, /warrant\/nullifier/);
    assert.match(book, /warrant\/tag/);
    assert.match(book, /D=4/);
    assert.match(book, /MAX_MERKLE_DEPTH = 20|MAX_DEPTH=20/);
    assert.match(book, /TRANSLATE/);
    assert.match(book, /FETCH/);
    assert.match(book, /not post-quantum/i);
    assert.match(book, /solo/);
    assert.match(book, /0x8704606Bde5E257dC009cCe55214Df70975f89c5/);
    assert.match(book, /dummy hops/i);
    assert.match(book, /30 minutes/);
    assert.match(book, /header is `warrant`/);
    assert.match(book, /subgraph/);
    assert.match(book, /live forest|live-mandate forest|revokeMandate/i);
  });

  it("names the four diagrams", function () {
    assert.deepEqual(
      DOCS_DIAGRAMS.map((d) => d.title),
      ["The loop", "The chain", "Who sees what", "Fire"],
    );
  });

  it("embeds an Excalidraw of the protocol", function () {
    const dashboard = join(root, "..");
    assert.equal(DOCS_EXCALIDRAW.src, "/protocol/how-warrant-works.png");
    assert.equal(existsSync(join(dashboard, "public", DOCS_EXCALIDRAW.src.slice(1))), true);
    const page = readFileSync(join(root, "../src/components/ProtocolDocs.tsx"), "utf8");
    assert.equal(page.includes("DOCS_EXCALIDRAW"), true);
    assert.equal(/download|excalidraw-dl|\.excalidraw/i.test(page), false);
    const book = docsBookText();
    assert.match(book, /Hops stay on the left/);
    assert.match(book, /Eight public signals cross Groth16/);
  });

  it("does not sell a proxy or say npx", function () {
    const book = docsBookText();
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
