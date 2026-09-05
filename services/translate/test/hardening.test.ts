import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bodyHashFromRaw } from "@warrant/core";
import { FileNullifierStore } from "../src/nullifiers-file.ts";

describe("FileNullifierStore", function () {
  it("persists takeRequest and consumeFree across instances", async function () {
    const dir = mkdtempSync(join(tmpdir(), "warrant-null-"));
    const path = join(dir, "nullifiers.json");
    try {
      const a = new FileNullifierStore(path);
      assert.equal(await a.takeRequest(1n, 2n), "fresh");
      assert.equal(await a.consumeFree(1n, 2), "granted");
      const b = new FileNullifierStore(path);
      assert.equal(await b.takeRequest(1n, 2n), "seen");
      assert.equal(await b.consumeFree(1n, 2), "granted");
      assert.equal(await b.consumeFree(1n, 2), "exhausted");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("bodyHashFromRaw", function () {
  it("matches JSON round-trip used by Hono getBody", function () {
    const raw = JSON.stringify({ text: "hi" });
    const fromString = bodyHashFromRaw(raw);
    const fromObject = bodyHashFromRaw(JSON.stringify(JSON.parse(raw)));
    assert.equal(fromString, fromObject);
    assert.match(fromString, /^0x[0-9a-f]{64}$/);
  });
});
