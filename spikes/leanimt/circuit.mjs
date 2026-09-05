import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { poseidon2, poseidon4 } from "poseidon-lite";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";

const here = dirname(fileURLToPath(import.meta.url));
const spikes = join(here, "..");
const zk = join(spikes, "zk");
const outDir = join(zk, "build");
const circomlib = join(spikes, "node_modules/circomlib/circuits");
const bmr = join(spikes, "node_modules/@zk-kit/binary-merkle-root.circom/src");
const snarkcli = join(spikes, "node_modules/snarkjs/cli.js");
const MAX_DEPTH = 20;

mkdirSync(outDir, { recursive: true });

function parseConstraints(info) {
  const m = info.match(/# of Constraints: (\d+)/);
  return m ? Number(m[1]) : null;
}

function compile(name) {
  const circom = join(zk, "circuits", `${name}.circom`);
  const t0 = Date.now();
  const log = execSync(
    `circom ${circom} --r1cs --wasm --sym -o ${outDir} -l ${circomlib} -l ${bmr}`,
    { encoding: "utf8", maxBuffer: 20_000_000 },
  );
  const info = execSync(`node ${snarkcli} r1cs info ${join(outDir, name + ".r1cs")}`, {
    encoding: "utf8",
  });
  return { name, compileMs: Date.now() - t0, constraints: parseConstraints(info), info: info.trim() };
}

function padSiblings(siblings) {
  const out = siblings.map((s) => s.toString());
  while (out.length < MAX_DEPTH) out.push("0");
  return out;
}

function witnessOk(wasm, inputPath, wtnsPath) {
  try {
    execSync(`node ${snarkcli} wtns calculate ${wasm} ${inputPath} ${wtnsPath}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err.stderr || err.message || "").toString().slice(0, 500) };
  }
}

const compiles = [];
for (const name of ["lean_imt", "warrant_lean"]) {
  console.error(`compiling ${name}...`);
  compiles.push(compile(name));
}

const id = new Identity("spike-seed");
const group = new Group();
group.addMember(id.commitment);
group.addMember(2n);
group.addMember(3n);
const proof = group.generateMerkleProof(0);

const leanInput = {
  leaf: id.commitment.toString(),
  depth: proof.siblings.length.toString(),
  index: proof.index.toString(),
  siblings: padSiblings(proof.siblings),
  expectedRoot: group.root.toString(),
};
const leanInputPath = join(outDir, "lean_imt_input.json");
writeFileSync(leanInputPath, JSON.stringify(leanInput, null, 2));

const leanWasm = join(outDir, "lean_imt_js/lean_imt.wasm");
const membership = witnessOk(leanWasm, leanInputPath, join(outDir, "lean_imt.wtns"));

const bad = { ...leanInput, expectedRoot: "1" };
const badPath = join(outDir, "lean_imt_bad.json");
writeFileSync(badPath, JSON.stringify(bad));
const membershipBad = witnessOk(leanWasm, badPath, join(outDir, "lean_imt_bad.wtns"));

const now = BigInt(Math.floor(Date.now() / 1000));
const [rootPkX, rootPkY] = id.publicKey;
const tier = 2n;
const epoch = 0n;
const leaf = poseidon4([rootPkX, rootPkY, tier, epoch]);

const mandateGroup = new Group();
mandateGroup.addMember(leaf);
mandateGroup.addMember(11n);
mandateGroup.addMember(22n);
const mProof = mandateGroup.generateMerkleProof(0);

const humanTag = 42n;
const contextHash = 99n;
const warrantInput = {
  merkleRoot: mandateGroup.root.toString(),
  contextHash: contextHash.toString(),
  nullifier: poseidon2([humanTag, contextHash]).toString(),
  effectiveScope: "1",
  effectiveBudgetCap: "200000",
  minExpiry: now.toString(),
  tier: tier.toString(),
  requestHash: "123456789",
  rootPkX: rootPkX.toString(),
  rootPkY: rootPkY.toString(),
  epoch: epoch.toString(),
  merkleDepth: mProof.siblings.length.toString(),
  merkleIndex: mProof.index.toString(),
  siblings: padSiblings(mProof.siblings),
  scopes: ["7", "1", "1", "1"],
  budgets: ["2000000", "200000", "200000", "200000"],
  expiries: [(now + 86400n).toString(), (now + 3600n).toString(), (now + 3600n).toString(), (now + 3600n).toString()],
  enabled: ["1", "1", "0", "0"],
  humanTag: humanTag.toString(),
};
const warrantPath = join(outDir, "warrant_lean_input.json");
writeFileSync(warrantPath, JSON.stringify(warrantInput, null, 2));
const warrantWasm = join(outDir, "warrant_lean_js/warrant_lean.wasm");
const warrantMembership = witnessOk(warrantWasm, warrantPath, join(outDir, "warrant_lean.wtns"));

const wide = { ...warrantInput, scopes: ["7", "15", "15", "15"], effectiveScope: "15" };
const widePath = join(outDir, "warrant_lean_wide.json");
writeFileSync(widePath, JSON.stringify(wide));
const warrantWide = witnessOk(warrantWasm, widePath, join(outDir, "warrant_lean_wide.wtns"));

const result = {
  package: "@zk-kit/binary-merkle-root.circom",
  packagePresent: existsSync(join(bmr, "binary-merkle-root.circom")),
  compiles,
  jsCircuitMatch: {
    groupSize: group.size,
    groupDepth: group.depth,
    proofSiblings: proof.siblings.map(String),
    proofIndex: proof.index,
    membershipWitness: membership,
    wrongRootRejected: membershipBad.ok === false,
    wrongRootErrorSnippet: membershipBad.ok ? null : membershipBad.error,
  },
  warrantLean: {
    leaf: leaf.toString(),
    groupRoot: mandateGroup.root.toString(),
    merkleDepth: mProof.siblings.length,
    witness: warrantMembership,
    widenedScopeRejected: warrantWide.ok === false,
  },
  notes: {
    api: "BinaryMerkleRoot(MAX_DEPTH)(leaf, depth, index, siblings) — v2.x single index + Num2Bits, not indices[]",
    mustUseV2: "v1.x was under-constrained (PSE 2025-07). Pin >=2.0.0.",
    padding: "pad siblings with 0 to MAX_DEPTH; depth = proof.siblings.length (LeanIMT actual depth)",
  },
};

writeFileSync(join(here, "circuit-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
