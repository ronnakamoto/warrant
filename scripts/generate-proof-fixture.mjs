/**
 * Write contracts/test/fixtures/proof.json (needs local zkey + wasm).
 * Run from repo root: node scripts/generate-proof-fixture.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { buildFullFixture } from "../circuits/test/lib/fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const build = join(root, "circuits/build");
const wasm = join(build, "warrant_js/warrant.wasm");
const zkey = join(build, "warrant_final.zkey");
const vkeyPath = join(build, "warrant_vkey.json");
const snarkcli = join(root, "node_modules/snarkjs/cli.js");
const outDir = join(root, "contracts/test/fixtures");

if (!existsSync(zkey) || !existsSync(wasm)) {
  console.error("missing zkey/wasm — compile + setup-groth16 first");
  process.exit(1);
}

const { input } = buildFullFixture();
const inp = input();
const inputPath = join(build, "gate_input.json");
const wtnsPath = join(build, "gate.wtns");
writeFileSync(inputPath, JSON.stringify(inp));
execSync(`node "${snarkcli}" wtns calculate "${wasm}" "${inputPath}" "${wtnsPath}"`, {
  stdio: "inherit",
});

const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, wtnsPath);
const vkey = JSON.parse(readFileSync(vkeyPath, "utf8"));
if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) {
  throw new Error("js verify failed");
}

const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
const [pA, pB, pC, pubs] = JSON.parse(`[${calldata}]`);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "proof.json"), JSON.stringify({ pA, pB, pC, pubs, merkleRoot: pubs[0] }, null, 2) + "\n");
console.log("wrote contracts/test/fixtures/proof.json");
