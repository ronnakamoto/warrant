/**
 * circom_tester wasm loader with Warrant include paths.
 * @see https://github.com/iden3/circom_tester
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const wasm_tester = require("circom_tester").wasm;

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "../../..");
export const CIRCUITS = join(ROOT, "circuits");
export const BUILD = join(CIRCUITS, "build", "circom_tester");

const INCLUDE = [
  join(ROOT, "node_modules/circomlib/circuits"),
  join(ROOT, "node_modules/@zk-kit/binary-merkle-root.circom/src"),
  CIRCUITS,
  join(CIRCUITS, "lib"),
];

/**
 * @param {string} circomRel path under circuits/ (e.g. "warrant_lean.circom" or "lib/scope_subset.circom")
 * @param {object} [extra] circom_tester options (templateName, templateParams, recompile, …)
 */
export async function loadCircuit(circomRel, extra = {}) {
  const circomInput = join(CIRCUITS, circomRel);
  const { recompile = true, output, include, ...rest } = extra;
  return wasm_tester(circomInput, {
    output: output ?? BUILD,
    include: include ?? INCLUDE,
    recompile,
    ...rest,
  });
}

/** Assert witness satisfies every R1CS constraint (circom_tester core check). */
export async function assertValidWitness(circuit, input) {
  const witness = await circuit.calculateWitness(input, true);
  await circuit.checkConstraints(witness);
  return witness;
}

/** Expect witness generation or constraint check to fail. */
export async function assertInvalidWitness(circuit, input) {
  let witness;
  try {
    witness = await circuit.calculateWitness(input, true);
  } catch {
    return;
  }
  let ok = false;
  try {
    await circuit.checkConstraints(witness);
    ok = true;
  } catch {
    return;
  }
  if (ok) {
    throw new Error("expected invalid witness, but constraints satisfied");
  }
}
