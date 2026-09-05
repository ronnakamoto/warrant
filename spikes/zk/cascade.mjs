import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { poseidon2, poseidon4, poseidon5 } from "poseidon-lite";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import { identity, leafOf, SEEDS } from "../lib/demo-identities.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const spikes = join(here, "..");
const outDir = join(here, "build");
const circomlib = join(spikes, "node_modules/circomlib/circuits");
const bmr = join(spikes, "node_modules/@zk-kit/binary-merkle-root.circom/src");
const snarkcli = join(spikes, "node_modules/snarkjs/cli.js");
const MAX_DEPTH = 20;
const D = 4;

mkdirSync(outDir, { recursive: true });
mkdirSync(join(here, "artifacts"), { recursive: true });

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
    return { ok: false, error: (err.stderr || err.message || "").toString().slice(0, 800) };
  }
}

function ensureCompiled(name) {
  const wasm = join(outDir, `${name}_js/${name}.wasm`);
  if (existsSync(wasm)) return wasm;
  execSync(
    `circom ${join(here, "circuits", `${name}.circom`)} --r1cs --wasm --sym -o ${outDir} -l ${circomlib} -l ${bmr}`,
    { stdio: "inherit", maxBuffer: 40_000_000 },
  );
  return wasm;
}

const leanWasm = ensureCompiled("warrant_lean");
const fullWasm = existsSync(join(outDir, "warrant_full_js/warrant_full.wasm"))
  ? join(outDir, "warrant_full_js/warrant_full.wasm")
  : null;

const alice = identity(SEEDS.alice);
const bob = identity(SEEDS.bob);
const carol = identity(SEEDS.carol);
const agent = new Identity("spike-agent");
const translator = new Identity("spike-translator");
const dummy = agent;

const tier = 2n;
const now = BigInt(Math.floor(Date.now() / 1000));
const aliceLeaf0 = leafOf(alice, tier, 0n);
const bobLeaf = leafOf(bob, tier, 0n);
const carolLeaf = leafOf(carol, tier, 0n);
const aliceLeaf1 = leafOf(alice, tier, 1n);

const group = new Group();
group.addMember(aliceLeaf0);
group.addMember(bobLeaf);
group.addMember(carolLeaf);
const rootBefore = group.root;
const proofBefore = group.generateMerkleProof(0);

const humanTag = 42n;
const contextHash = 99n;
const scopes = [7n, 1n, 1n, 1n];
const budgets = [2_000_000n, 200_000n, 200_000n, 200_000n];
const expiries = [now + 86400n, now + 3600n, now + 3600n, now + 3600n];
const enabled = [1, 1, 0, 0];

function leanInput({ merkleRoot, epoch, proof, requestHash = 123456789n }) {
  return {
    merkleRoot: merkleRoot.toString(),
    contextHash: contextHash.toString(),
    nullifier: poseidon2([humanTag, contextHash]).toString(),
    effectiveScope: "1",
    effectiveBudgetCap: "200000",
    minExpiry: now.toString(),
    tier: tier.toString(),
    requestHash: requestHash.toString(),
    rootPkX: alice.publicKey[0].toString(),
    rootPkY: alice.publicKey[1].toString(),
    epoch: epoch.toString(),
    merkleDepth: proof.siblings.length.toString(),
    merkleIndex: proof.index.toString(),
    siblings: padSiblings(proof.siblings),
    scopes: scopes.map(String),
    budgets: budgets.map(String),
    expiries: expiries.map(String),
    enabled: enabled.map(String),
    humanTag: humanTag.toString(),
  };
}

function writeWitness(label, input) {
  const inputPath = join(outDir, `${label}.json`);
  writeFileSync(inputPath, JSON.stringify(input));
  return witnessOk(leanWasm, inputPath, join(outDir, `${label}.wtns`));
}

const before = writeWitness("cascade_before", leanInput({ merkleRoot: rootBefore, epoch: 0n, proof: proofBefore }));

group.updateMember(0, aliceLeaf1);
const rootAfter = group.root;
const proofAfter = group.generateMerkleProof(0);

const oldLeafNewRoot = writeWitness(
  "cascade_old_leaf_new_root",
  leanInput({ merkleRoot: rootAfter, epoch: 0n, proof: proofBefore }),
);
const oldLeafOldRoot = writeWitness(
  "cascade_old_leaf_old_root",
  leanInput({ merkleRoot: rootBefore, epoch: 0n, proof: proofBefore }),
);
const newLeafNewRoot = writeWitness(
  "cascade_new_leaf_new_root",
  leanInput({ merkleRoot: rootAfter, epoch: 1n, proof: proofAfter }),
);
const oldEpochNewSiblings = writeWitness(
  "cascade_old_epoch_new_siblings",
  leanInput({ merkleRoot: rootAfter, epoch: 0n, proof: proofAfter }),
);

const wideBudget = leanInput({ merkleRoot: rootAfter, epoch: 1n, proof: proofAfter });
wideBudget.budgets = ["2000000", "3000000", "3000000", "3000000"];
wideBudget.effectiveBudgetCap = "3000000";
const budgetRejected = writeWitness("cascade_wide_budget", wideBudget);

const wideExpiry = leanInput({ merkleRoot: rootAfter, epoch: 1n, proof: proofAfter });
wideExpiry.expiries = [(now + 3600n).toString(), (now + 86400n).toString(), (now + 86400n).toString(), (now + 86400n).toString()];
const expiryRejected = writeWitness("cascade_wide_expiry", wideExpiry);

const paddedWide = leanInput({ merkleRoot: rootAfter, epoch: 1n, proof: proofAfter });
paddedWide.budgets = ["2000000", "200000", "9999999", "9999999"];
const paddedHopIgnored = writeWitness("cascade_padded_wide_budget", paddedWide);

let fullHopAfterRevoke = null;
if (fullWasm) {
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
    const signer = i === 0 ? alice : children[i - 1];
    mandateSigs.push(enabled[i] ? signer.signMessage(M) : alice.signMessage(M));
  }
  const reqSig = translator.signMessage(123456789n);
  const fullBase = {
    ...leanInput({ merkleRoot: rootAfter, epoch: 0n, proof: proofBefore }),
    childPkX: children.map((c) => c.publicKey[0].toString()),
    childPkY: children.map((c) => c.publicKey[1].toString()),
    sigS: mandateSigs.map((s) => s.S.toString()),
    sigR8x: mandateSigs.map((s) => s.R8[0].toString()),
    sigR8y: mandateSigs.map((s) => s.R8[1].toString()),
    reqS: reqSig.S.toString(),
    reqR8x: reqSig.R8[0].toString(),
    reqR8y: reqSig.R8[1].toString(),
  };
  const fullPath = join(outDir, "cascade_full_old_on_new.json");
  writeFileSync(fullPath, JSON.stringify(fullBase));
  fullHopAfterRevoke = witnessOk(fullWasm, fullPath, join(outDir, "cascade_full_old_on_new.wtns"));

  const fullNew = {
    ...fullBase,
    ...leanInput({ merkleRoot: rootAfter, epoch: 1n, proof: proofAfter }),
    childPkX: fullBase.childPkX,
    childPkY: fullBase.childPkY,
    sigS: fullBase.sigS,
    sigR8x: fullBase.sigR8x,
    sigR8y: fullBase.sigR8y,
    reqS: fullBase.reqS,
    reqR8x: fullBase.reqR8x,
    reqR8y: fullBase.reqR8y,
  };
  const fullNewPath = join(outDir, "cascade_full_new.json");
  writeFileSync(fullNewPath, JSON.stringify(fullNew));
  fullHopAfterRevoke = {
    oldSignedChainOnNewRoot: fullHopAfterRevoke,
    newEpochSameSignatures: witnessOk(fullWasm, fullNewPath, join(outDir, "cascade_full_new.wtns")),
  };
}

const result = {
  idea:
    "Revoke = epoch bump + LeanIMT.updateMember. Old leaf is gone from the new root. Mandate signatures stay valid; membership is what dies.",
  tree: {
    size: group.size,
    depth: group.depth,
    aliceLeaf0: aliceLeaf0.toString(),
    aliceLeaf1: aliceLeaf1.toString(),
    rootBefore: rootBefore.toString(),
    rootAfter: rootAfter.toString(),
    rootsDiffer: rootBefore !== rootAfter,
  },
  warrantLean: {
    epoch0AgainstLiveRoot: before,
    oldLeafNewRootRejected: oldLeafNewRoot.ok === false,
    oldLeafNewRoot: oldLeafNewRoot,
    oldLeafOldRootStillProves: oldLeafOldRoot.ok === true,
    oldLeafOldRoot: oldLeafOldRoot,
    newLeafNewRootAccepted: newLeafNewRoot.ok === true,
    newLeafNewRoot: newLeafNewRoot,
    oldEpochNewSiblingsRejected: oldEpochNewSiblings.ok === false,
    oldEpochNewSiblings: oldEpochNewSiblings,
  },
  attenuation: {
    childBudgetGtParentRejected: budgetRejected.ok === false,
    childBudgetGtParent: budgetRejected,
    childExpiryGtParentRejected: expiryRejected.ok === false,
    childExpiryGtParent: expiryRejected,
    paddedDisabledHopMayExceedBudget: paddedHopIgnored.ok === true,
    paddedDisabledHop: paddedHopIgnored,
  },
  warrantFull: fullHopAfterRevoke,
  verifierChoice: {
    currentRootOnly: "oldLeafOldRoot proves, but isCurrentRoot(oldRoot)=false → instant cascade (demo)",
    knownRootWindow: "oldLeafOldRoot + isKnownRoot(oldRoot)=true for 1h → in-flight survival, revoked identity can still prove until window ends",
  },
  ok:
    before.ok === true &&
    oldLeafNewRoot.ok === false &&
    oldLeafOldRoot.ok === true &&
    newLeafNewRoot.ok === true &&
    oldEpochNewSiblings.ok === false &&
    budgetRejected.ok === false &&
    expiryRejected.ok === false &&
    paddedHopIgnored.ok === true &&
    (fullHopAfterRevoke
      ? fullHopAfterRevoke.oldSignedChainOnNewRoot.ok === false &&
        fullHopAfterRevoke.newEpochSameSignatures.ok === true
      : true),
};

writeFileSync(join(here, "artifacts/cascade-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
