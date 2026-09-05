#!/usr/bin/env node
/**
 * Composition root for the agent CLI.
 * `new` SnarkjsProver / wallet clients only here (and demo session).
 */
import { randomBytes } from "node:crypto";
import {
  createMandate,
  hashLeaf,
} from "@warrant/core";
import { bindRootOnChain, readCurrentRoot } from "./bind.js";
import { proveForChallenge, warrantHeaderJson } from "./prove-flow.js";
import { createSnarkjsProver } from "./prover.js";
import { warrantFetch } from "./fetch.js";
import {
  appendLeaf,
  defaultStorePath,
  ensureIdentity,
  freshFieldTag,
  identityOf,
  loadState,
  parseScope,
  parseTtl,
  rebuildGroup,
  requireTags,
  saveState,
  type WarrantState,
} from "./store.js";

function usage(): never {
  console.error(`warrant — agent CLI

Usage:
  warrant keygen --name <id> [--seed <string>]
  warrant bind-root --name <id> --wallet <0x...> --tier <n> [--local]
      [--rpc <url>] [--registry <0x...>] [--private-key <0x...>]
  warrant delegate --from <id> --to <id> --scope translate[,fetch] --budget <n> --ttl <1h>
  warrant prove --as <id> --nonce <n> --merkle-root <n> --path <p> [--amount] [--pay-to] [--body-hash]
  warrant fetch --as <id> --url <url> [--body <json>]

Store: $WARRANT_STORE (default ~/.warrant/state.json)
`);
  process.exit(2);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args[i + 1];
}

function requireFlag(args: string[], name: string): string {
  const v = flag(args, name);
  if (!v) {
    console.error(`missing ${name}`);
    usage();
  }
  return v;
}

function cmdKeygen(args: string[]): void {
  const name = requireFlag(args, "--name");
  const seed = flag(args, "--seed") ?? randomBytes(16).toString("hex");
  const path = flag(args, "--store") ?? defaultStorePath();
  const state = loadState(path);
  if (state.identities[name]) {
    console.error(`identity ${name} already exists`);
    process.exit(1);
  }
  const id = ensureIdentity(state, name, seed);
  saveState(state, path);
  console.log(
    JSON.stringify(
      {
        name,
        pkX: id.publicKey[0].toString(),
        pkY: id.publicKey[1].toString(),
        store: path,
      },
      null,
      2,
    ),
  );
}

async function cmdBindRoot(args: string[]): Promise<void> {
  const name = requireFlag(args, "--name");
  const wallet = requireFlag(args, "--wallet") as `0x${string}`;
  const tier = Number(requireFlag(args, "--tier"));
  const local = args.includes("--local");
  const path = flag(args, "--store") ?? defaultStorePath();
  const state = loadState(path);
  const id = identityOf(state, name);
  const epoch = 0;
  const leaf = hashLeaf(id.publicKey[0], id.publicKey[1], BigInt(tier), BigInt(epoch));

  let root: bigint;
  if (local) {
    appendLeaf(state, leaf);
    root = rebuildGroup(state).root;
  } else {
    const rpc = flag(args, "--rpc") ?? process.env.BASE_SEPOLIA_RPC;
    const registry = (flag(args, "--registry") ?? process.env.REGISTRY_ADDRESS) as
      | `0x${string}`
      | undefined;
    const pk = (flag(args, "--private-key") ?? process.env.BIND_PRIVATE_KEY) as
      | `0x${string}`
      | undefined;
    if (!rpc || !registry || !pk) {
      console.error("bind-root needs --rpc --registry --private-key (or env), or --local");
      process.exit(1);
    }
    await bindRootOnChain({
      rpcUrl: rpc,
      registry,
      privateKey: pk,
      wallet,
      pkX: id.publicKey[0],
      pkY: id.publicKey[1],
      tier,
    });
    root = await readCurrentRoot({ rpcUrl: rpc, registry });
    if (!state.members.includes(leaf.toString())) appendLeaf(state, leaf);
  }

  // Fresh per-root tags — never share static demo defaults across users
  state.humanTag = freshFieldTag();
  state.contextHash = freshFieldTag();
  state.rootName = name;
  state.rootWallet = wallet;
  state.rootTier = tier;
  state.rootEpoch = epoch;
  // Re-bind invalidates prior mandate chain (tags changed)
  state.mandates = [];
  saveState(state, path);
  console.log(
    JSON.stringify(
      {
        name,
        wallet,
        tier,
        leaf: leaf.toString(),
        merkleRoot: root.toString(),
        humanTag: state.humanTag,
        contextHash: state.contextHash,
        local,
        store: path,
      },
      null,
      2,
    ),
  );
}

function parentScopeBudget(state: WarrantState, from: string): {
  parentHash: bigint;
  parentScope?: bigint;
  parentBudgetCap?: bigint;
  parentExpiry?: bigint;
  tier: bigint;
  epoch: bigint;
} {
  if (state.rootName === from) {
    return {
      parentHash: 0n,
      tier: BigInt(state.rootTier ?? 0),
      epoch: BigInt(state.rootEpoch ?? 0),
    };
  }
  const prior = [...state.mandates].reverse().find((m) => m.to === from);
  if (!prior) throw new Error(`no mandate ending at ${from} — cannot delegate`);
  return {
    parentHash: BigInt(prior.hash),
    parentScope: BigInt(prior.scope),
    parentBudgetCap: BigInt(prior.budgetCap),
    parentExpiry: BigInt(prior.expiry),
    tier: BigInt(prior.tier),
    epoch: BigInt(prior.epoch),
  };
}

function cmdDelegate(args: string[]): void {
  const from = requireFlag(args, "--from");
  const to = requireFlag(args, "--to");
  const scopeSpec = flag(args, "--scope") ?? "translate";
  const budget = BigInt(requireFlag(args, "--budget"));
  const ttl = flag(args, "--ttl") ?? "1h";
  const path = flag(args, "--store") ?? defaultStorePath();
  const state = loadState(path);
  const { humanTag } = requireTags(state);

  ensureIdentity(state, to);
  const parent = identityOf(state, from);
  const child = identityOf(state, to);
  const scope = parseScope(scopeSpec);
  const expiry = parseTtl(ttl);
  const ctx = parentScopeBudget(state, from);

  const signed = createMandate({
    parent,
    child,
    scope,
    budgetCap: budget,
    expiry,
    tier: ctx.tier,
    epoch: ctx.epoch,
    parentHash: ctx.parentHash,
    humanTag: BigInt(humanTag),
    parentScope: ctx.parentScope,
    parentBudgetCap: ctx.parentBudgetCap,
    parentExpiry: ctx.parentExpiry,
  });
  state.mandates.push({
    from,
    to,
    scope: signed.scope.toString(),
    budgetCap: signed.budgetCap.toString(),
    expiry: signed.expiry.toString(),
    tier: signed.tier.toString(),
    epoch: signed.epoch.toString(),
    parentHash: signed.parentHash.toString(),
    humanTag,
    hash: signed.hash.toString(),
    signature: {
      S: signed.signature.S.toString(),
      R8x: signed.signature.R8x.toString(),
      R8y: signed.signature.R8y.toString(),
    },
  });
  saveState(state, path);
  console.log(
    JSON.stringify(
      {
        from,
        to,
        scope: signed.scope.toString(),
        budgetCap: signed.budgetCap.toString(),
        expiry: signed.expiry.toString(),
        hash: signed.hash.toString(),
        store: path,
      },
      null,
      2,
    ),
  );
}

async function cmdProve(args: string[]): Promise<void> {
  const as = requireFlag(args, "--as");
  const nonce = requireFlag(args, "--nonce");
  const merkleRoot = requireFlag(args, "--merkle-root");
  const path = flag(args, "--path") ?? "/v1/translate";
  const method = flag(args, "--method") ?? "POST";
  const amount = flag(args, "--amount") ?? "100000";
  const payTo = flag(args, "--pay-to") ?? "0.0.10311260";
  const bodyHash = flag(args, "--body-hash") ?? "";
  const storePath = flag(args, "--store") ?? defaultStorePath();
  const state = loadState(storePath);

  const result = await proveForChallenge({
    state,
    as,
    challenge: { method, path, nonce, merkleRoot, amount, payTo, bodyHash },
    prover: createSnarkjsProver(),
  });
  console.log(warrantHeaderJson(result));
}

async function cmdFetch(args: string[]): Promise<void> {
  const as = requireFlag(args, "--as");
  const url = requireFlag(args, "--url");
  const body = flag(args, "--body") ?? JSON.stringify({ text: "hello warrant" });
  const storePath = flag(args, "--store") ?? defaultStorePath();
  const state = loadState(storePath);
  const prover = createSnarkjsProver();

  const res = await warrantFetch(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
    { as, state, storePath, prover },
  );
  const text = await res.text();
  console.log(
    JSON.stringify(
      {
        status: res.status,
        body: text.slice(0, 2000),
      },
      null,
      2,
    ),
  );
  if (!res.ok) process.exit(1);
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "-h" || cmd === "--help") usage();
  switch (cmd) {
    case "keygen":
      cmdKeygen(rest);
      break;
    case "bind-root":
      await cmdBindRoot(rest);
      break;
    case "delegate":
      cmdDelegate(rest);
      break;
    case "prove":
      await cmdProve(rest);
      break;
    case "fetch":
      await cmdFetch(rest);
      break;
    default:
      console.error(`unknown command: ${cmd}`);
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
