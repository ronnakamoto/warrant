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
import { personhoodFromEnv } from "./personhood.js";
import { loadGraphStatus } from "./graph.js";
import { readBinding } from "./sync-root.js";
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
import {
  bindPurse,
  defaultPursePath,
  initPurse,
  loadPurse,
  pursePublicView,
} from "./purse.js";
import { startReadyServer } from "./ready.js";

function usage(): never {
  console.error(`warrant — agent CLI

Usage:
  warrant keygen --name <id> [--seed <string>]
  warrant bind-root --name <id> --wallet <0x...> --tier <n> [--local]
      [--rpc <url>] [--registry <0x...>] [--private-key <0x...>]
  warrant sync-root [--wallet <0x...>] [--rpc] [--registry]
  warrant delegate --from <id> --to <id> --scope translate[,fetch] --budget <n> --ttl <1h>
  warrant prove --as <id> --nonce <n> --merkle-root <n> --path <p> [--amount] [--pay-to] [--body-hash]
  warrant fetch --as <id> --url <url> [--body <json>]
  warrant ready
  warrant act --url <url> [--body <json>] [--as translator]
  warrant status
  warrant purse init | show | bind --account 0.0.N --vault 0.0.M
  warrant graph-status

Store: $WARRANT_STORE (default ~/.warrant/state.json)
Purse: $WARRANT_PURSE (default ~/.warrant/purse.json) — never printed
Ready: http://127.0.0.1:17879 — public ids only
Graph: GRAPH_API_KEY + GRAPH_WARRANT_QUERY_URL (Studio); Agent0 is composed automatically.
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

  let humanFromBook: bigint | null = null;
  if (tier > 0) {
    const personhood = personhoodFromEnv();
    humanFromBook = await personhood.lookupHuman(wallet);
    if (humanFromBook === null) {
      console.error(
        `tier ${tier} requires AgentBook / personhood lookup for ${wallet} (set WORLDCHAIN_RPC + AGENTBOOK_ADDRESS, or use --tier 0 demo)`,
      );
      process.exit(1);
    }
  }

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

  // AgentBook id → per-human nullifier. tier=0 demo → session tag (not "per human").
  state.humanTag = humanFromBook !== null ? humanFromBook.toString() : freshFieldTag();
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

/**
 * After on-chain revoke: pull epoch/leaf into the local store and clear mandates
 * (must re-delegate at the new epoch).
 */
async function cmdSyncRoot(args: string[]): Promise<void> {
  const path = flag(args, "--store") ?? defaultStorePath();
  const state = loadState(path);
  const wallet = (flag(args, "--wallet") ?? state.rootWallet) as `0x${string}` | undefined;
  const rpc = flag(args, "--rpc") ?? process.env.BASE_SEPOLIA_RPC;
  const registry = (flag(args, "--registry") ?? process.env.REGISTRY_ADDRESS) as
    | `0x${string}`
    | undefined;
  if (!wallet || !rpc || !registry) {
    console.error("sync-root needs --wallet (or store.rootWallet), --rpc, --registry");
    process.exit(1);
  }
  const synced = await readBinding({ rpcUrl: rpc, registry, wallet });
  if (state.rootName) {
    const local = identityOf(state, state.rootName);
    if (local.publicKey[0] !== synced.pkX || local.publicKey[1] !== synced.pkY) {
      console.error(
        `sync-root: local ${state.rootName} pk does not match on-chain binding for ${wallet}`,
      );
      process.exit(1);
    }
  }
  // Single on-chain leaf for this wallet — extra local members (e.g. demo bob) diverge from currentRoot.
  state.members = [synced.leaf.toString()];
  state.rootEpoch = synced.epoch;
  state.rootTier = synced.tier;
  state.rootWallet = wallet;
  state.mandates = [];
  saveState(state, path);
  console.log(
    JSON.stringify(
      {
        wallet,
        epoch: synced.epoch,
        tier: synced.tier,
        leaf: synced.leaf.toString(),
        currentRoot: synced.currentRoot.toString(),
        mandatesCleared: true,
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

async function cmdReady(args: string[]): Promise<void> {
  const path = flag(args, "--purse") ?? defaultPursePath();
  const port = Number(flag(args, "--port") ?? 17879);
  const { ensurePurse } = await import("./ready.js");
  const purse = ensurePurse(path);
  const view = pursePublicView(purse);
  const handle = await startReadyServer({ port, pursePath: path });
  console.log(
    JSON.stringify(
      {
        ...view,
        ready: `http://127.0.0.1:${handle.port}`,
        next: "Open the tab and Let it spend. Never print keys.",
      },
      null,
      2,
    ),
  );
  await new Promise<void>((resolve) => {
    const stop = () => {
      void handle.close().finally(() => resolve());
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

function cmdStatus(args: string[]): void {
  const path = flag(args, "--purse") ?? defaultPursePath();
  const purse = loadPurse(path);
  if (!purse) {
    console.error("no purse — warrant ready");
    process.exit(1);
  }
  console.log(JSON.stringify(pursePublicView(purse), null, 2));
}

function cmdPurse(args: string[]): void {
  const sub = args[0];
  const rest = args.slice(1);
  const path = flag(rest, "--store") ?? flag(rest, "--purse") ?? defaultPursePath();
  if (sub === "init") {
    const purse = initPurse(path);
    console.log(
      JSON.stringify(
        {
          ...pursePublicView(purse),
          next: "Create the purse in the tab with this public key, then warrant purse bind --account 0.0.N --vault 0.0.M",
        },
        null,
        2,
      ),
    );
    return;
  }
  if (sub === "show") {
    const purse = loadPurse(path);
    if (!purse) {
      console.error("no purse — warrant purse init");
      process.exit(1);
    }
    console.log(JSON.stringify(pursePublicView(purse), null, 2));
    return;
  }
  if (sub === "bind") {
    const account = requireFlag(rest, "--account");
    const vault = requireFlag(rest, "--vault");
    const purse = bindPurse(path, { accountId: account, vaultAccountId: vault });
    console.log(JSON.stringify(pursePublicView(purse), null, 2));
    return;
  }
  console.error(`warrant purse init | show | bind --account 0.0.N --vault 0.0.M`);
  process.exit(2);
}

async function cmdAct(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    console.log(`warrant act — prove locally, pay ExactHedera, retry

Usage:
  warrant act --url <url> [--body <json>] [--as translator]

Store: $WARRANT_STORE (default ~/.warrant/state.json)
Pay: local purse (spender). HashPack holds the vault. Never print keys.
Zkey: downloaded via scripts/download-zkey.sh / WARRANT_ZKEY_URL if missing.
Prints only the shop text.
`);
    return;
  }
  const url = requireFlag(args, "--url");
  const body =
    flag(args, "--body") ?? JSON.stringify({ text: "Good morning.", source: "en", target: "es" });
  const as = flag(args, "--as") ?? "translator";
  const storePath = flag(args, "--store") ?? defaultStorePath();
  const { warrantAct } = await import("./act.js");
  const { ensureArtifacts } = await import("./ensure-artifacts.js");
  const out = await warrantAct(url, body, {
    as,
    storePath,
    prover: createSnarkjsProver(),
    ensureArtifacts,
  });
  if (out.status === 200) {
    console.log(out.text);
    return;
  }
  console.error(out.text);
  process.exit(1);
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
    case "sync-root":
      await cmdSyncRoot(rest);
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
    case "ready":
      await cmdReady(rest);
      break;
    case "status":
      cmdStatus(rest);
      break;
    case "act":
      await cmdAct(rest);
      break;
    case "purse":
      cmdPurse(rest);
      break;
    case "graph-status":
      console.log(JSON.stringify(await loadGraphStatus(), null, 2));
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
