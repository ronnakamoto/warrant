/**
 * WP1 witness tests for warrant_lean.
 * Asserts: valid 2-hop proves; negatives throw at witness generation.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { poseidon2, poseidon4 } from "poseidon-lite";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const build = join(root, "circuits/build");
const wasm = join(build, "warrant_lean_js/warrant_lean.wasm");
const snarkcli = join(root, "node_modules/snarkjs/cli.js");
const tmp = join(build, "test-tmp");
const MAX_DEPTH = 20;

mkdirSync(tmp, { recursive: true });

function padSiblings(siblings) {
  const out = siblings.map((s) => BigInt(s).toString());
  while (out.length < MAX_DEPTH) out.push("0");
  return out;
}

function leafOf(id, tier, epoch) {
  return poseidon4([id.publicKey[0], id.publicKey[1], tier, epoch]);
}

function witnessOk(input, label) {
  const inputPath = join(tmp, `${label}.json`);
  const wtnsPath = join(tmp, `${label}.wtns`);
  writeFileSync(inputPath, JSON.stringify(input));
  try {
    execSync(`node "${snarkcli}" wtns calculate "${wasm}" "${inputPath}" "${wtnsPath}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

const alice = new Identity("warrant-wp1-alice");
const bob = new Identity("warrant-wp1-bob");
const carol = new Identity("warrant-wp1-carol");
const tier = 2n;
const now = BigInt(Math.floor(Date.now() / 1000));
const humanTag = 42n;
const contextHash = 99n;

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

group.updateMember(0, aliceLeaf1);
const rootAfter = group.root;
const proofAfter = group.generateMerkleProof(0);

const scopes = [7n, 1n, 1n, 1n];
const budgets = [2_000_000n, 200_000n, 200_000n, 200_000n];
const expiries = [now + 86400n, now + 3600n, now + 3600n, now + 3600n];
const enabled = [1, 1, 0, 0];

function baseInput({ merkleRoot, epoch, proof, requestHash = 123456789n }) {
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

const cases = [];

function expect(label, ok, input) {
  const got = witnessOk(input, label);
  cases.push({ label, expected: ok, got });
  if (got !== ok) {
    console.error(`FAIL ${label}: expected witness ok=${ok}, got ${got}`);
  } else {
    console.log(`ok ${label} (witness ok=${got})`);
  }
}

// Valid: epoch-0 leaf against live root before revoke
expect("valid_before", true, baseInput({ merkleRoot: rootBefore, epoch: 0n, proof: proofBefore }));

// Valid: after revoke with matching epoch + siblings
expect("valid_after_revoke", true, baseInput({ merkleRoot: rootAfter, epoch: 1n, proof: proofAfter }));

// Wrong root: old leaf / siblings against new root
expect(
  "wrong_root",
  false,
  baseInput({ merkleRoot: rootAfter, epoch: 0n, proof: proofBefore }),
);

// Stale epoch: epoch 0 with post-revoke siblings/root
expect(
  "stale_epoch",
  false,
  baseInput({ merkleRoot: rootAfter, epoch: 0n, proof: proofAfter }),
);

// Widened scope
{
  const input = baseInput({ merkleRoot: rootAfter, epoch: 1n, proof: proofAfter });
  input.scopes = ["1", "7", "7", "7"];
  input.effectiveScope = "7";
  expect("widened_scope", false, input);
}

// Widened budget
{
  const input = baseInput({ merkleRoot: rootAfter, epoch: 1n, proof: proofAfter });
  input.budgets = ["2000000", "3000000", "3000000", "3000000"];
  input.effectiveBudgetCap = "3000000";
  expect("widened_budget", false, input);
}

// Widened expiry
{
  const input = baseInput({ merkleRoot: rootAfter, epoch: 1n, proof: proofAfter });
  input.expiries = [
    (now + 3600n).toString(),
    (now + 86400n).toString(),
    (now + 86400n).toString(),
    (now + 86400n).toString(),
  ];
  expect("widened_expiry", false, input);
}

// Wrong nullifier
{
  const input = baseInput({ merkleRoot: rootAfter, epoch: 1n, proof: proofAfter });
  input.nullifier = "1";
  expect("wrong_nullifier", false, input);
}

const failed = cases.filter((c) => c.expected !== c.got);
rmSync(tmp, { recursive: true, force: true });

if (failed.length) {
  console.error(`\n${failed.length} case(s) failed`);
  process.exit(1);
}
console.log(`\n${cases.length}/${cases.length} witness cases passed`);
