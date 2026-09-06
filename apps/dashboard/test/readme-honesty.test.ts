import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readme = readFileSync(resolve(process.cwd(), "README.md"), "utf8");

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
});
