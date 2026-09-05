/**
 * WP10 — Definition of Done (solo path: ENS skipped).
 *
 * Gates:
 * 1. Bind documented tier=0 root (+ per-root humanTag/contextHash)
 * 2. Delegate translate with attenuation; widened scope rejected
 * 3. Translator → /v1/translate: free quota then 402; audit is nullifier-only
 * 4. Revoke (currentRoot bump) → next call 403 root_revoked
 *
 * Usage: pnpm dod
 */
import assert from "node:assert/strict";
import {
  TRANSLATE,
  FETCH,
  createMandate,
  hashLeaf,
  keygen,
  type IProver,
  type IRootChecker,
  type WarrantProof,
} from "../packages/core/src/index.ts";
import { warrantFetch } from "../packages/agent/src/fetch.ts";
import {
  appendLeaf,
  freshFieldTag,
  rebuildGroup,
  requireTags,
  saveState,
  type WarrantState,
} from "../packages/agent/src/store.ts";
import { createApp } from "../services/translate/src/app.ts";
import type { AuditEvent, HcsSink } from "../services/translate/src/hcs.ts";
import {
  initializeWired,
  mockHederaFacilitator,
  wire,
} from "../services/translate/src/wiring.ts";

class MutableRootChecker implements IRootChecker {
  constructor(public root: bigint) {}
  async isAcceptable(merkleRoot: bigint): Promise<boolean> {
    return merkleRoot !== 0n && merkleRoot === this.root;
  }
}

function fakeProver(): IProver {
  return {
    async prove(): Promise<WarrantProof> {
      return { pi_a: ["0"], pi_b: [["0"]], pi_c: ["0"] };
    },
  };
}

function memoryHcs(): HcsSink & { events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    events,
    async submit(event) {
      events.push({ ...event });
    },
  };
}

function step(n: number, label: string, detail?: unknown): void {
  console.log(JSON.stringify({ dod: n, label, ...(detail ? { detail } : {}) }));
}

async function listen(app: { fetch: typeof fetch }, port = 0): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const { serve } = await import("@hono/node-server");
  const server = serve({ fetch: app.fetch, port });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no listen address");
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function main(): Promise<void> {
  // —— 1. Bind tier=0 root (documented personhood substitute) ——
  const alice = keygen("dod-alice");
  const orch = keygen("dod-orch");
  const translator = keygen("dod-translator");
  const tier = 0; // documented tier=0 — World Sandbox / AgentBook optional
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
    rootWallet: "0x00000000000000000000000000000000000000d0",
    rootTier: tier,
    rootEpoch: epoch,
  };
  appendLeaf(state, leaf);
  const group = rebuildGroup(state);
  const merkleRoot = group.root;
  requireTags(state);
  step(1, "bind tier=0 root", {
    tier,
    leaf: leaf.toString(),
    merkleRoot: merkleRoot.toString(),
    note: "Personhood: documented tier=0 (AgentBook path remains in code)",
  });

  // —— 2. Delegate attenuated; widen rejected ——
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
  assert.throws(
    () =>
      createMandate({
        parent: orch,
        child: translator,
        scope: TRANSLATE | FETCH,
        budgetCap: 200_000n,
        expiry: now + 3600n,
        tier: BigInt(tier),
        epoch: BigInt(epoch),
        parentHash: m1.hash,
        humanTag: BigInt(humanTag),
        parentScope: m1.scope,
        parentBudgetCap: m1.budgetCap,
        parentExpiry: m1.expiry,
      }),
    /scope is not a subset of parent/,
  );
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
  step(2, "delegate translate + attenuation; widen rejected", {
    hops: 2,
    childBudget: "200000",
  });

  // —— 3. Free then paid (402) + nullifier-only audit ——
  const roots = new MutableRootChecker(merkleRoot);
  const hcs = memoryHcs();
  const verifier = {
    async verify() {
      return true;
    },
  };
  const wired = wire({
    facilitatorClient: mockHederaFacilitator(),
    fixedMerkleRoot: merkleRoot, // challenges keep pre-revoke root for requestHash
    roots, // isAcceptable — mutated on revoke
    verifier,
    hcs,
    policy: {
      requireScope: TRANSLATE,
      minTier: 0,
      freeCallsPerHuman: 3,
    },
  });

  await initializeWired(wired);
  const app = createApp({ wired, hcs });
  const server = await listen(app);
  const translateUrl = `${server.url}/v1/translate`;
  const storePath = `/tmp/warrant-dod-${Date.now()}.json`;
  saveState(state, storePath);
  const prover = fakeProver();
  const body = JSON.stringify({ text: "dod" });

  for (let i = 0; i < 3; i++) {
    const res = await warrantFetch(
      translateUrl,
      { method: "POST", headers: { "content-type": "application/json" }, body },
      { as: "translator", state, storePath, prover },
    );
    assert.equal(res.status, 200, `free call ${i + 1}`);
  }
  assert.equal(hcs.events.length, 3);
  for (const ev of hcs.events) {
    const keys = Object.keys(ev).sort();
    assert.deepEqual(keys, ["nullifier", "scope", "tier"].sort());
    assert.ok(!JSON.stringify(ev).includes("alice"));
    assert.ok(!JSON.stringify(ev).toLowerCase().includes("0x"));
  }

  const paid = await warrantFetch(
    translateUrl,
    { method: "POST", headers: { "content-type": "application/json" }, body },
    { as: "translator", state, storePath, prover },
  );
  assert.equal(paid.status, 402, "fourth call → payment required");
  step(3, "free×3 then 402; audit nullifier-only", {
    audits: hcs.events.length,
    fourth: paid.status,
  });

  // —— 4. Revoke → root_revoked ——
  const revokedRoot = merkleRoot ^ 0xdeadn; // distinct non-zero
  roots.root = revokedRoot === 0n ? 1n : revokedRoot;
  const after = await warrantFetch(
    translateUrl,
    { method: "POST", headers: { "content-type": "application/json" }, body },
    { as: "translator", state, storePath, prover },
  );
  assert.equal(after.status, 403);
  const errBody = (await after.json()) as { error?: string };
  assert.equal(errBody.error, "root_revoked");
  step(4, "revoke → 403 root_revoked", { error: errBody.error });

  step(5, "ENS skipped (solo path)", { status: "skipped" });

  await server.close();
  console.log(JSON.stringify({ dod: "pass", gates: [1, 2, 3, 4], ens: "skipped" }));
}

main().catch((err) => {
  console.error(JSON.stringify({ dod: "fail", error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
