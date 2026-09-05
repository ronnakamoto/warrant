/**
 * Two-agent demo session (orchestrator → translator → translate service).
 *
 * Offline-friendly: local bind tree + ALLOW_DEMO_ROOT=1 on translate.
 * Live HCS: set HEDERA_* on the translate process.
 *
 * Usage:
 *   pnpm --filter @warrant/agent demo -- --prepare-only   # print merkleRoot + store, exit
 *   WARRANT_STORE=... pnpm --filter @warrant/agent demo  # call translate
 *   WARRANT_REAL_PROVE=1 ...                             # snarkjs prove (needs zkey)
 */
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TRANSLATE,
  createMandate,
  hashLeaf,
  keygen,
  type IProver,
  type WarrantProof,
} from "@warrant/core";
import { warrantFetch } from "../src/fetch.js";
import {
  appendLeaf,
  freshFieldTag,
  loadState,
  rebuildGroup,
  saveState,
  type WarrantState,
} from "../src/store.js";

async function buildLocalState(
  storePath: string,
): Promise<{ state: WarrantState; root: string; storePath: string }> {
  const alice = keygen("demo-alice");
  const orch = keygen("demo-orchestrator");
  const translator = keygen("demo-translator");
  const tier = 2;
  const epoch = 0;
  const leaf = hashLeaf(alice.publicKey[0], alice.publicKey[1], BigInt(tier), BigInt(epoch));
  const humanTag = freshFieldTag();
  const contextHash = freshFieldTag();

  const state: WarrantState = {
    version: 1,
    identities: {
      alice: {
        privateKey: String(alice.privateKey),
        pkX: alice.publicKey[0].toString(),
        pkY: alice.publicKey[1].toString(),
      },
      orchestrator: {
        privateKey: String(orch.privateKey),
        pkX: orch.publicKey[0].toString(),
        pkY: orch.publicKey[1].toString(),
      },
      translator: {
        privateKey: String(translator.privateKey),
        pkX: translator.publicKey[0].toString(),
        pkY: translator.publicKey[1].toString(),
      },
    },
    members: [],
    humanTag,
    contextHash,
    mandates: [],
    rootName: "alice",
    rootWallet: "0x0000000000000000000000000000000000000001",
    rootTier: tier,
    rootEpoch: epoch,
  };
  appendLeaf(state, leaf);
  const group = rebuildGroup(state);
  const now = BigInt(Math.floor(Date.now() / 1000));

  const m1 = createMandate({
    parent: alice,
    child: orch,
    scope: TRANSLATE,
    budgetCap: 2_000_000n,
    expiry: now + 86400n,
    tier: BigInt(tier),
    epoch: BigInt(epoch),
    parentHash: 0n,
    humanTag: BigInt(humanTag),
  });
  const m2 = createMandate({
    parent: orch,
    child: translator,
    scope: TRANSLATE,
    budgetCap: 200_000n,
    expiry: now + 3600n,
    tier: BigInt(tier),
    epoch: BigInt(epoch),
    parentHash: m1.hash,
    humanTag: BigInt(humanTag),
    parentScope: m1.scope,
    parentBudgetCap: m1.budgetCap,
    parentExpiry: m1.expiry,
  });
  for (const [from, to, m] of [
    ["alice", "orchestrator", m1] as const,
    ["orchestrator", "translator", m2] as const,
  ]) {
    state.mandates.push({
      from,
      to,
      scope: m.scope.toString(),
      budgetCap: m.budgetCap.toString(),
      expiry: m.expiry.toString(),
      tier: m.tier.toString(),
      epoch: m.epoch.toString(),
      parentHash: m.parentHash.toString(),
      humanTag,
      hash: m.hash.toString(),
      signature: {
        S: m.signature.S.toString(),
        R8x: m.signature.R8x.toString(),
        R8y: m.signature.R8y.toString(),
      },
    });
  }

  saveState(state, storePath);
  return { state, root: group.root.toString(), storePath };
}

function resolveStorePath(): string {
  if (process.env.WARRANT_STORE) return process.env.WARRANT_STORE;
  const dir = mkdtempSync(join(tmpdir(), "warrant-demo-"));
  return join(dir, "state.json");
}

/** Fake prover for offline session smoke (no zkey). */
function fakeProver(): IProver {
  return {
    async prove(): Promise<WarrantProof> {
      return { pi_a: ["0"], pi_b: [["0"]], pi_c: ["0"] };
    },
  };
}

async function main(): Promise<void> {
  const url = process.env.TRANSLATE_URL ?? "http://127.0.0.1:8787/v1/translate";
  const prepareOnly = process.argv.includes("--prepare-only");
  const storePath = resolveStorePath();

  let state: WarrantState;
  let root: string;
  if (existsSync(storePath) && !prepareOnly && process.env.WARRANT_STORE) {
    state = loadState(storePath);
    root = rebuildGroup(state).root.toString();
  } else {
    ({ state, root } = await buildLocalState(storePath));
  }

  const useRealProve = process.env.WARRANT_REAL_PROVE === "1";

  console.log(
    JSON.stringify(
      {
        step: prepareOnly ? "prepare" : "delegate",
        store: storePath,
        merkleRoot: root,
        hint: `Start translate with FIXED_MERKLE_ROOT=${root} ALLOW_DEMO_ROOT=1 (demo only)`,
      },
      null,
      2,
    ),
  );

  if (prepareOnly) {
    return;
  }

  console.log(JSON.stringify({ step: "orchestrator→translator", scope: "translate" }));

  const body = JSON.stringify({ text: "warrant demo" });
  try {
    const { createSnarkjsProver } = await import("../src/prover.js");
    const prover = useRealProve ? createSnarkjsProver() : fakeProver();
    const res = await warrantFetch(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      },
      {
        as: "translator",
        state,
        storePath,
        prover,
      },
    );
    const text = await res.text();
    console.log(
      JSON.stringify(
        {
          step: "translator→translate",
          status: res.status,
          body: text.slice(0, 500),
          note: "Server log / HCS should show nullifier only",
        },
        null,
        2,
      ),
    );
    if (res.status === 200) {
      console.log(
        JSON.stringify({
          step: "ok",
          mirror: `https://hashscan.io/testnet/topic/${process.env.HEDERA_TOPIC_ID ?? "0.0.10336558"}`,
        }),
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        step: "call-failed",
        error: err instanceof Error ? err.message : String(err),
        hint: "Is translate running with FIXED_MERKLE_ROOT + ALLOW_DEMO_ROOT=1?",
      }),
    );
    process.exit(1);
  }
}

main();
