import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const readme = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../README.md"),
  "utf8",
);

describe("README honesty", function () {
  it("does not claim Warrant solved ACTA", function () {
    assert.equal(/Warrant addresses that gap/i.test(readme), false);
    assert.match(readme, /not a complete ACTA stack/i);
    assert.match(readme, /Warrant will prove|helper sees the witness/i);
  });

  it("points strangers at the live Try host", function () {
    assert.match(readme, /https:\/\/warrant-beta\.vercel\.app/);
    assert.match(readme, /translate-production-ed28\.up\.railway\.app/);
  });

  it("shows the protocol picture from the docs", function () {
    assert.match(readme, /apps\/dashboard\/public\/protocol\/how-warrant-works\.png/);
    assert.match(readme, /WarrantHop/);
    assert.match(readme, /eight public signals/i);
    assert.match(readme, /https:\/\/warrant-beta\.vercel\.app\/docs/);
    assert.equal(readme.includes("npx"), false);
  });
});
