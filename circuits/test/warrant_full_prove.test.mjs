/**
 * End-to-end Groth16 prove/verify for the product compile artifacts.
 * Constraint soundness is covered by warrant_full.test.mjs (circom_tester).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "chai";
import { buildFullFixture } from "./lib/fixtures.mjs";
import { ROOT } from "./lib/tester.mjs";

const snarkcli = join(ROOT, "node_modules/snarkjs/cli.js");
const productBuild = join(ROOT, "circuits/build");
const wasm = join(productBuild, "warrant_js/warrant.wasm");
const r1cs = join(productBuild, "warrant.r1cs");
const zkey = join(productBuild, "warrant_final.zkey");
const vkey = join(productBuild, "warrant_vkey.json");
const tmp = join(productBuild, "prove-tmp");

function ensureProductWasm() {
  if (existsSync(wasm) && existsSync(r1cs)) return;
  execSync(`"${join(ROOT, "scripts/compile-circuit")}" warrant`, { stdio: "inherit" });
}

function ensureZkey() {
  if (existsSync(zkey) && existsSync(vkey) && statSync(vkey).size > 0) return;
  execSync(`"${join(ROOT, "scripts/setup-groth16")}" warrant`, {
    stdio: "inherit",
    env: {
      ...process.env,
      WARRANT_CEREMONY_ENTROPY:
        process.env.WARRANT_CEREMONY_ENTROPY || "wp2-test-entropy-do-not-use-in-prod-32b",
      WARRANT_CEREMONY_BEACON:
        process.env.WARRANT_CEREMONY_BEACON ||
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
  });
}

describe("warrant full Groth16 prove/verify", function () {
  this.timeout(600_000);

  before(function () {
    if (process.env.SKIP_GROTH16 === "1") this.skip();
    ensureProductWasm();
    ensureZkey();
    mkdirSync(tmp, { recursive: true });
  });

  it("proves and verifies a valid 2-hop witness", function () {
    const fx = buildFullFixture();
    const input = fx.input();
    const inputPath = join(tmp, "input.json");
    const wtnsPath = join(tmp, "witness.wtns");
    writeFileSync(inputPath, JSON.stringify(input));

    execSync(`node "${snarkcli}" wtns calculate "${wasm}" "${inputPath}" "${wtnsPath}"`, {
      stdio: "pipe",
    });

    const proofPath = join(tmp, "proof.json");
    const publicPath = join(tmp, "public.json");
    execSync(
      `node "${snarkcli}" groth16 prove "${zkey}" "${wtnsPath}" "${proofPath}" "${publicPath}"`,
      { stdio: "pipe" },
    );
    execSync(`node "${snarkcli}" groth16 verify "${vkey}" "${publicPath}" "${proofPath}"`, {
      stdio: "pipe",
    });

    const publics = JSON.parse(readFileSync(publicPath, "utf8"));
    assert.lengthOf(publics, 8);
    assert.isAbove(statSync(zkey).size, 1_000_000);
  });
});
