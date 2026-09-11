import {
  Bound,
  MandateInserted,
  MandateRevoked,
  Revoked,
} from "../generated/MandateRegistry/MandateRegistry";
import { Binding, ForestLeaf, MandateHop, Registry, RevokeEvent } from "../generated/schema";
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

  const row = new ForestLeaf(index.toString());
  row.index = index;
  row.leaf = event.params.leaf;
  row.kind = "identity";
  row.wallet = event.params.wallet;
  row.save();
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

  const forest = ForestLeaf.load(binding.index.toString());
  if (forest != null) {
    forest.leaf = event.params.newLeaf;
    forest.save();
  }
}

export function handleMandateInserted(event: MandateInserted): void {
  const reg = registry();
  reg.currentRoot = event.params.root;
  reg.size = reg.size.plus(BigInt.fromI32(1));
  reg.updatedAt = event.block.timestamp;
  reg.save();

  const row = new ForestLeaf(event.params.index.toString());
  row.index = event.params.index;
  row.leaf = event.params.hash;
  row.kind = "mandate";
  row.wallet = event.params.wallet;
  row.save();

  const hop = new MandateHop(event.params.hash.toString());
  hop.hash = event.params.hash;
  hop.wallet = event.params.wallet;
  hop.index = event.params.index;
  hop.live = true;
  hop.save();
}

export function handleMandateRevoked(event: MandateRevoked): void {
  const reg = registry();
  reg.currentRoot = event.params.root;
  reg.updatedAt = event.block.timestamp;
  reg.save();

  const hop = MandateHop.load(event.params.hash.toString());
  if (hop != null) {
    hop.live = false;
    hop.save();
    const forest = ForestLeaf.load(hop.index.toString());
    if (forest != null) {
      forest.leaf = BigInt.zero();
      forest.save();
    }
  }
}
