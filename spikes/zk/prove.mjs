import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { poseidon2, poseidon4 } from "poseidon-lite";
import * as snarkjs from "snarkjs";

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, "build");
const wasm = join(build, "warrant_core_js/warrant_core.wasm");
const zkey = join(build, "warrant_core_final.zkey");
const ptau = join(here, "ptau/pot16.ptau");
const snarkcli = join(here, "../node_modules/snarkjs/cli.js");

function merkleRootFromLeaf(leaf, depth) {
  const pathElements = [];
  const pathIndices = [];
  let cur = leaf;
  for (let i = 0; i < depth; i++) {
    const sib = 0n;
    pathElements.push(sib.toString());
    pathIndices.push("0");
    cur = poseidon2([cur, sib]);
  }
  return { root: cur, pathElements, pathIndices };
}

const now = BigInt(Math.floor(Date.now() / 1000));
const rootPkX = 1714916583046383316109430357479853758404619829741766734126976174413783503593n;
const rootPkY = 17189227092011842798495365524861571815951472812685598708220192156830167080075n;
const tier = 2n;
const epoch = 0n;
const leaf = poseidon4([rootPkX, rootPkY, tier, epoch]);
const { root, pathElements, pathIndices } = merkleRootFromLeaf(leaf, 16);

const humanTag = 42n;
const contextHash = 99n;
const nullifier = poseidon2([humanTag, contextHash]);

const input = {
  merkleRoot: root.toString(),
  contextHash: contextHash.toString(),
  nullifier: nullifier.toString(),
  effectiveScope: "1",
  effectiveBudgetCap: "200000",
  minExpiry: now.toString(),
  tier: tier.toString(),
  requestHash: "123456789",
  rootPkX: rootPkX.toString(),
  rootPkY: rootPkY.toString(),
  epoch: epoch.toString(),
  pathElements,
  pathIndices,
  scopes: ["7", "1", "1", "1"],
  budgets: ["2000000", "200000", "200000", "200000"],
  expiries: [(now + 86400n).toString(), (now + 3600n).toString(), (now + 3600n).toString(), (now + 3600n).toString()],
  enabled: ["1", "1", "0", "0"],
  humanTag: humanTag.toString(),
};

mkdirSync(build, { recursive: true });
writeFileSync(join(build, "input.json"), JSON.stringify(input, null, 2));

const timings = {};
let t = Date.now();
execSync(`node ${snarkcli} wtns calculate ${wasm} ${join(build, "input.json")} ${join(build, "witness.wtns")}`, {
  stdio: "inherit",
});
timings.witnessMs = Date.now() - t;

if (!existsSync(ptau)) {
  console.log(JSON.stringify({ ok: false, error: "ptau missing", timings, leaf: leaf.toString(), root: root.toString() }, null, 2));
  process.exit(2);
}

t = Date.now();
execSync(`node ${snarkcli} groth16 setup ${join(build, "warrant_core.r1cs")} ${ptau} ${join(build, "warrant_core_0000.zkey")}`, {
  stdio: "inherit",
});
timings.setupMs = Date.now() - t;

t = Date.now();
execSync(`node ${snarkcli} zkey contribute ${join(build, "warrant_core_0000.zkey")} ${zkey} --name="spike" -e="spike entropy"`, {
  stdio: "inherit",
});
timings.contributeMs = Date.now() - t;

t = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, join(build, "witness.wtns"));
timings.proveMs = Date.now() - t;

t = Date.now();
const vkey = await snarkjs.zkey.exportVerificationKey(zkey);
const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
timings.verifyMs = Date.now() - t;

writeFileSync(join(build, "vkey.json"), JSON.stringify(vkey));
execSync(`node ${snarkcli} zkey export solidityverifier ${zkey} ${join(build, "WarrantVerifier.sol")}`, { stdio: "inherit" });

const result = {
  ok: verified,
  constraints: 10917,
  publicSignals,
  proofProtocol: proof.protocol,
  timings,
  verifierBytes: existsSync(join(build, "WarrantVerifier.sol"))
    ? (await import("node:fs")).statSync(join(build, "WarrantVerifier.sol")).size
    : 0,
};
writeFileSync(join(here, "prove-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
