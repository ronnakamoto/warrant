import { poseidon4 } from "poseidon-lite";
import { Identity } from "@semaphore-protocol/identity";

export const SEEDS = {
  alice: "warrant-alice",
  bob: "warrant-bob",
  carol: "warrant-carol",
};

export function identity(seed) {
  return new Identity(seed);
}

export function leafOf(id, tier, epoch) {
  return poseidon4([id.publicKey[0], id.publicKey[1], BigInt(tier), BigInt(epoch)]);
}

export function pk(id) {
  return { pkX: id.publicKey[0].toString(), pkY: id.publicKey[1].toString() };
}
