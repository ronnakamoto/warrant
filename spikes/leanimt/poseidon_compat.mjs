import { poseidon2, poseidon4, poseidon5 } from "poseidon-lite";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPoseidon } from "circomlibjs";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";

const poseidon = await buildPoseidon();
const F = poseidon.F;

function circomPoseidon(inputs) {
  const h = poseidon(inputs.map((x) => F.e(x)));
  return F.toObject(h).toString();
}

const a = 3n;
const b = 5n;
const lite2 = poseidon2([a, b]).toString();
const circom2 = circomPoseidon([a, b]);

const lite4 = poseidon4([1n, 2n, 3n, 4n]).toString();
const circom4 = circomPoseidon([1n, 2n, 3n, 4n]);

const lite5 = poseidon5([1n, 2n, 3n, 4n, 5n]).toString();
const circom5 = circomPoseidon([1n, 2n, 3n, 4n, 5n]);

const id = new Identity("spike-seed");
const group = new Group();
group.addMember(id.commitment);
group.addMember(2n);
group.addMember(3n);
const proof = group.generateMerkleProof(0);

const result = {
  poseidon2_match: lite2 === circom2,
  poseidon2_lite: lite2,
  poseidon2_circomlibjs: circom2,
  poseidon4_match: lite4 === circom4,
  poseidon4_lite: lite4,
  poseidon4_circomlibjs: circom4,
  poseidon5_match: lite5 === circom5,
  poseidon5_lite: lite5,
  poseidon5_circomlibjs: circom5,
  semaphore: {
    commitment: id.commitment.toString(),
    publicKey: id.publicKey.map(String),
    groupRoot: group.root.toString(),
    merkleProof: {
      index: proof.index,
      siblings: proof.siblings.map(String),
    },
  },
};

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
