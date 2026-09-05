import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bodyHashFromCanonical, bodyHashFromRaw } from "@warrant/core";
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

  it("fails closed on corrupt JSON", function () {
    const dir = mkdtempSync(join(tmpdir(), "warrant-null-"));
    const path = join(dir, "nullifiers.json");
    try {
      writeFileSync(path, "{not json");
      assert.throws(() => new FileNullifierStore(path), /corrupt nullifier store/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serializes concurrent consumeFree", async function () {
    const dir = mkdtempSync(join(tmpdir(), "warrant-null-"));
    const path = join(dir, "nullifiers.json");
    try {
      const store = new FileNullifierStore(path);
      const results = await Promise.all([
        store.consumeFree(9n, 1),
        store.consumeFree(9n, 1),
        store.consumeFree(9n, 1),
      ]);
      assert.equal(results.filter((r) => r === "granted").length, 1);
      assert.equal(results.filter((r) => r === "exhausted").length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("bodyHashFromCanonical", function () {
  it("pretty and compact JSON match (Hono parse + stringify)", function () {
    const compact = JSON.stringify({ text: "hi" });
    const pretty = JSON.stringify({ text: "hi" }, null, 2);
    assert.notEqual(compact, pretty);
    assert.equal(bodyHashFromCanonical(compact), bodyHashFromCanonical(pretty));
    assert.equal(bodyHashFromCanonical(compact), bodyHashFromCanonical({ text: "hi" }));
    assert.match(bodyHashFromCanonical(compact), /^0x[0-9a-f]{64}$/);
  });

  it("non-JSON strings hash as raw bytes", function () {
    assert.equal(bodyHashFromCanonical("not-json"), bodyHashFromRaw("not-json"));
  });
});
