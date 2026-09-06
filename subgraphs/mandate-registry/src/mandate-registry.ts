import { Bound, Revoked } from "../generated/MandateRegistry/MandateRegistry";
import { Binding, Registry, RevokeEvent } from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

function registry(): Registry {
  let row = Registry.load("1");
  if (row == null) {
    row = new Registry("1");
    row.currentRoot = BigInt.zero();
    row.size = BigInt.zero();
    row.updatedAt = BigInt.zero();
  }
  return row;
}

export function handleBound(event: Bound): void {
  const reg = registry();
  const index = reg.size;
  reg.currentRoot = event.params.root;
  reg.size = reg.size.plus(BigInt.fromI32(1));
  reg.updatedAt = event.block.timestamp;
  reg.save();

  const binding = new Binding(event.params.wallet.toHex());
  binding.wallet = event.params.wallet;
  binding.leaf = event.params.leaf;
  binding.tier = event.params.tier;
  binding.epoch = 0;
  binding.index = index;
  binding.revokedOnce = false;
  binding.boundAt = event.block.timestamp;
  binding.updatedAt = event.block.timestamp;
  binding.save();
}

export function handleRevoked(event: Revoked): void {
  const reg = registry();
  reg.currentRoot = event.params.root;
  reg.updatedAt = event.block.timestamp;
  reg.save();

  const id = event.params.wallet.toHex();
  let binding = Binding.load(id);
  if (binding == null) {
    binding = new Binding(id);
    binding.wallet = event.params.wallet;
    binding.tier = 0;
    binding.index = BigInt.zero();
    binding.boundAt = event.block.timestamp;
  }
  binding.leaf = event.params.newLeaf;
  binding.epoch = event.params.epoch.toI32();
  binding.revokedOnce = true;
  binding.updatedAt = event.block.timestamp;
  binding.save();

  const ev = new RevokeEvent(event.transaction.hash.toHex() + "-" + event.logIndex.toString());
  ev.wallet = event.params.wallet;
  ev.oldLeaf = event.params.oldLeaf;
  ev.newLeaf = event.params.newLeaf;
  ev.root = event.params.root;
  ev.epoch = event.params.epoch.toI32();
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();
}
