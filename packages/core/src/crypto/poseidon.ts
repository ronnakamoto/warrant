/**
 * poseidon-lite only — product TS must not pull circomlibjs.
 * Arity 2/3/4/5/10 match the circuit templates (tag, nullifier, registry-era
 * Poseidon4, leaf, mandate).
 */
export {
  poseidon2,
  poseidon3,
  poseidon4,
  poseidon5,
  poseidon10,
} from "poseidon-lite";
