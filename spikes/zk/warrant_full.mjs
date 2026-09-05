import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { poseidon2, poseidon4, poseidon5 } from "poseidon-lite";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";

const here = dirname(fileURLToPath(import.meta.url));
const spikes = join(here, "..");
const outDir = join(here, "build");
const circomlib = join(spikes, "node_modules/circomlib/circuits");
const bmr = join(spikes, "node_modules/@zk-kit/binary-merkle-root.circom/src");
const snarkcli = join(spikes, "node_modules/snarkjs/cli.js");
const ptau = join(here, "ptau/pot16.ptau");
const MAX_DEPTH = 20;
const D = 4;

mkdirSync(outDir, { recursive: true });
mkdirSync(join(here, "artifacts"), { recursive: true });

function parseConstraints(info) {
  const m = info.match(/# of Constraints: (\d+)/);
  return m ? Number(m[1]) : null;
}

function witnessOk(wasm, inputPath, wtnsPath) {
  try {
    execSync(`node ${snarkcli} wtns calculate ${wasm} ${inputPath} ${wtnsPath}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err.stderr || err.message || "").toString().slice(0, 800) };
  }
}

function padSiblings(siblings) {
  const out = siblings.map((s) => s.toString());
  while (out.length < MAX_DEPTH) out.push("0");
  return out;
}

function sigFields(sig) {
  return { S: sig.S.toString(), R8x: sig.R8[0].toString(), R8y: sig.R8[1].toString() };
}

console.error("compiling warrant_full...");
const compileT0 = Date.now();
execSync(
  `circom ${join(here, "circuits/warrant_full.circom")} --r1cs --wasm --sym -o ${outDir} -l ${circomlib} -l ${bmr}`,
  { stdio: "inherit", maxBuffer: 40_000_000 },
);
const compileMs = Date.now() - compileT0;
const info = execSync(`node ${snarkcli} r1cs info ${join(outDir, "warrant_full.r1cs")}`, {
  encoding: "utf8",
});
const constraints = parseConstraints(info);

const root = new Identity("spike-root");
const agent = new Identity("spike-agent");
const translator = new Identity("spike-translator");
const dummy = agent;

const now = BigInt(Math.floor(Date.now() / 1000));
const tier = 2n;
const epoch = 0n;
const leaf = poseidon4([root.publicKey[0], root.publicKey[1], tier, epoch]);
const group = new Group();
group.addMember(leaf);
group.addMember(11n);
group.addMember(22n);
const mProof = group.generateMerkleProof(0);

const scopes = [7n, 1n, 1n, 1n];
const budgets = [2_000_000n, 200_000n, 200_000n, 200_000n];
const expiries = [now + 86400n, now + 3600n, now + 3600n, now + 3600n];
const enabled = [1, 1, 0, 0];
const children = [agent, translator, dummy, dummy];

const mandateSigs = [];
for (let i = 0; i < D; i++) {
  const M = poseidon5([
    children[i].publicKey[0],
    children[i].publicKey[1],
    scopes[i],
    budgets[i],
    expiries[i],
  ]);
  const signer = i === 0 ? root : children[i - 1];
  mandateSigs.push(enabled[i] ? signer.signMessage(M) : root.signMessage(M));
}

const requestHash = 123456789n;
const reqSig = translator.signMessage(requestHash);
const humanTag = 42n;
const contextHash = 99n;

const input = {
  merkleRoot: group.root.toString(),
  contextHash: contextHash.toString(),
  nullifier: poseidon2([humanTag, contextHash]).toString(),
  effectiveScope: "1",
  effectiveBudgetCap: "200000",
  minExpiry: now.toString(),
  tier: tier.toString(),
  requestHash: requestHash.toString(),
  rootPkX: root.publicKey[0].toString(),
  rootPkY: root.publicKey[1].toString(),
  epoch: epoch.toString(),
  merkleDepth: mProof.siblings.length.toString(),
  merkleIndex: mProof.index.toString(),
  siblings: padSiblings(mProof.siblings),
  scopes: scopes.map(String),
  budgets: budgets.map(String),
  expiries: expiries.map(String),
  enabled: enabled.map(String),
  humanTag: humanTag.toString(),
  childPkX: children.map((c) => c.publicKey[0].toString()),
  childPkY: children.map((c) => c.publicKey[1].toString()),
  sigS: mandateSigs.map((s) => s.S.toString()),
  sigR8x: mandateSigs.map((s) => s.R8[0].toString()),
  sigR8y: mandateSigs.map((s) => s.R8[1].toString()),
  reqS: reqSig.S.toString(),
  reqR8x: reqSig.R8[0].toString(),
  reqR8y: reqSig.R8[1].toString(),
};

const inputPath = join(outDir, "warrant_full_input.json");
writeFileSync(inputPath, JSON.stringify(input, null, 2));
const wasm = join(outDir, "warrant_full_js/warrant_full.wasm");
const good = witnessOk(wasm, inputPath, join(outDir, "warrant_full.wtns"));

const wide = {
  ...input,
  scopes: ["7", "15", "15", "15"],
  effectiveScope: "15",
};
writeFileSync(join(outDir, "warrant_full_wide.json"), JSON.stringify(wide));
const wideW = witnessOk(wasm, join(outDir, "warrant_full_wide.json"), join(outDir, "warrant_full_wide.wtns"));

const badSig = { ...input, reqS: (BigInt(input.reqS) + 1n).toString() };
writeFileSync(join(outDir, "warrant_full_badsig.json"), JSON.stringify(badSig));
const badSigW = witnessOk(
  wasm,
  join(outDir, "warrant_full_badsig.json"),
  join(outDir, "warrant_full_badsig.wtns"),
);

const timings = { compileMs };
let prove = null;
if (good.ok && existsSync(ptau)) {
  const z0 = join(outDir, "warrant_full_0000.zkey");
  const zf = join(outDir, "warrant_full_final.zkey");
  let t = Date.now();
  execSync(`node ${snarkcli} groth16 setup ${join(outDir, "warrant_full.r1cs")} ${ptau} ${z0}`, {
    stdio: "inherit",
  });
  timings.setupMs = Date.now() - t;
  t = Date.now();
  execSync(`node ${snarkcli} zkey contribute ${z0} ${zf} --name="spike-full" -e="spike entropy full"`, {
    stdio: "inherit",
  });
  timings.contributeMs = Date.now() - t;
  t = Date.now();
  execSync(
    `node ${snarkcli} groth16 prove ${zf} ${join(outDir, "warrant_full.wtns")} ${join(outDir, "warrant_full_proof.json")} ${join(outDir, "warrant_full_public.json")}`,
    { stdio: "inherit" },
  );
  timings.proveMs = Date.now() - t;
  execSync(
    `node ${snarkcli} zkey export verificationkey ${zf} ${join(outDir, "warrant_full_vkey.json")}`,
    { stdio: "inherit" },
  );
  t = Date.now();
  execSync(
    `node ${snarkcli} groth16 verify ${join(outDir, "warrant_full_vkey.json")} ${join(outDir, "warrant_full_public.json")} ${join(outDir, "warrant_full_proof.json")}`,
    { stdio: "inherit" },
  );
  timings.verifyMs = Date.now() - t;
  prove = {
    ok: true,
    zkeyBytes: statSync(zf).size,
    public: JSON.parse((await import("node:fs")).readFileSync(join(outDir, "warrant_full_public.json"), "utf8")),
  };
}

const result = {
  constraints,
  estimated: 13018 + 5 * 8086,
  compileMs,
  hop2Witness: good,
  widenedScopeRejected: wideW.ok === false,
  tamperedRequestSigRejected: badSigW.ok === false,
  timings,
  prove,
  zkeyFitsGit: prove ? prove.zkeyBytes < 20 * 1024 * 1024 : null,
};

writeFileSync(join(here, "artifacts/warrant-full-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
