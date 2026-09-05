/**
 * Generate contracts/test/fixtures/registry.json
 * Run from repo root: node scripts/generate-registry-fixture.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { poseidon2, poseidon4 } from "poseidon-lite";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../contracts/test/fixtures");

const SEEDS = { alice: "warrant-alice", bob: "warrant-bob", carol: "warrant-carol" };
const tier = 2n;

function leafOf(id, epoch) {
  return poseidon4([id.publicKey[0], id.publicKey[1], tier, epoch]);
}

function pk(id) {
  return { pkX: id.publicKey[0].toString(), pkY: id.publicKey[1].toString() };
}

const alice = new Identity(SEEDS.alice);
const bob = new Identity(SEEDS.bob);
const carol = new Identity(SEEDS.carol);

const aliceLeaf0 = leafOf(alice, 0n);
const aliceLeaf1 = leafOf(alice, 1n);
const bobLeaf = leafOf(bob, 0n);
const carolLeaf = leafOf(carol, 0n);

const group = new Group();
group.addMember(aliceLeaf0);
const rootAfterAlice = group.root;
group.addMember(bobLeaf);
const rootAfterBob = group.root;
group.addMember(carolLeaf);
const rootAfterCarol = group.root;
const revokeProof = group.generateMerkleProof(0);
group.updateMember(0, aliceLeaf1);
const rootAfterRevoke = group.root;

const fixture = {
  poseidon2_35: poseidon2([3n, 5n]).toString(),
  poseidon4_1234: poseidon4([1n, 2n, 3n, 4n]).toString(),
  alice: { ...pk(alice), leaf0: aliceLeaf0.toString(), leaf1: aliceLeaf1.toString() },
  bob: { ...pk(bob), leaf0: bobLeaf.toString() },
  carol: { ...pk(carol), leaf0: carolLeaf.toString() },
  rootAfterAlice: rootAfterAlice.toString(),
  rootAfterBob: rootAfterBob.toString(),
  rootAfterCarol: rootAfterCarol.toString(),
  rootAfterRevoke: rootAfterRevoke.toString(),
  revokeSiblings: revokeProof.siblings.map(String),
  revokeIndex: revokeProof.index,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "registry.json"), JSON.stringify(fixture, null, 2) + "\n");
console.log("wrote contracts/test/fixtures/registry.json");
