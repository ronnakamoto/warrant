import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMandate, hashLeaf, keygen, TRANSLATE } from "@ronnakamoto/warrant-core";
import {
  appendLeaf,
  emptyState,
  ensureIdentity,
  freshFieldTag,
  loadState,
  parseScope,
  parseTtl,
  rebuildGroup,
  replayMandates,
  requireTags,
  saveState,
  type WarrantState,
} from "../src/store.ts";
import { UnboundError, isUnboundError } from "../src/sync-root.ts";
import { warrantHeaderJson, proveForChallenge } from "../src/prove-flow.ts";
import type { IProver, WarrantProof } from "@ronnakamoto/warrant-core";

describe("@warrant/agent store + delegate", function () {
  it("parseScope and parseTtl", function () {
    assert.equal(parseScope("translate"), TRANSLATE);
    assert.equal(parseScope("translate,fetch"), TRANSLATE | 2n);
    const exp = parseTtl("1h");
    const now = BigInt(Math.floor(Date.now() / 1000));
    assert.ok(exp > now && exp <= now + 3600n + 5n);
  });

  it("empty state has no shared humanTag defaults", function () {
    const s = emptyState();
    assert.equal(s.humanTag, undefined);
    assert.equal(s.contextHash, undefined);
    assert.throws(() => requireTags(s));
  });

  it("saveState writes mode 0o600", function () {
    const dir = mkdtempSync(join(tmpdir(), "warrant-agent-"));
    const path = join(dir, "state.json");
    const state = emptyState();
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    saveState(state, path);
    const mode = statSync(path).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it("freshFieldTag values differ", function () {
    assert.notEqual(freshFieldTag(), freshFieldTag());
  });

  it("keygen → local bind tags → 2-hop delegate → replayMandates stable", function () {
    const dir = mkdtempSync(join(tmpdir(), "warrant-agent-"));
    const path = join(dir, "state.json");
    let state: WarrantState = emptyState();
    const alice = ensureIdentity(state, "alice", "seed-alice");
    const orch = ensureIdentity(state, "orchestrator", "seed-orch");
    const tr = ensureIdentity(state, "translator", "seed-tr");
    const tier = 2;
    const leaf = hashLeaf(alice.publicKey[0], alice.publicKey[1], BigInt(tier), 0n);
    appendLeaf(state, leaf);
    state.rootName = "alice";
    state.rootTier = tier;
    state.rootEpoch = 0;
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    const { humanTag } = requireTags(state);

    const now = BigInt(Math.floor(Date.now() / 1000));
    const m1 = createMandate({
      parent: alice,
      child: orch,
      scope: TRANSLATE,
      budgetCap: 1_000_000n,
      expiry: now + 86400n,
      tier: BigInt(tier),
      epoch: 0n,
      parentHash: 0n,
      humanTag: BigInt(humanTag),
    });
    const m2 = createMandate({
      parent: orch,
      child: tr,
      scope: TRANSLATE,
      budgetCap: 100_000n,
      expiry: now + 3600n,
      tier: BigInt(tier),
      epoch: 0n,
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
    saveState(state, path);
    state = loadState(path);
    const replayed = replayMandates(state);
    assert.equal(replayed.length, 2);
    assert.equal(replayed[0]!.hash, m1.hash);
    assert.equal(rebuildGroup(state).root, createGroupRoot(leaf));
  });

  it("widened scope rejected at createMandate", function () {
    const parent = keygen("p");
    const child = keygen("c");
    assert.throws(() =>
      createMandate({
        parent,
        child,
        scope: TRANSLATE | 2n,
        budgetCap: 1n,
        expiry: 1n,
        tier: 0n,
        epoch: 0n,
        parentHash: 0n,
        humanTag: 1n,
        parentScope: TRANSLATE,
      }),
    );
  });

  it("proveForChallenge with fake prover emits warrant header + nonce", async function () {
    const dir = mkdtempSync(join(tmpdir(), "warrant-agent-"));
    const path = join(dir, "state.json");
    const alice = keygen("a2");
    const orch = keygen("o2");
    const tr = keygen("t2");
    const tier = 1;
    const leaf = hashLeaf(alice.publicKey[0], alice.publicKey[1], BigInt(tier), 0n);
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
          privateKey: String(tr.privateKey),
          pkX: tr.publicKey[0].toString(),
          pkY: tr.publicKey[1].toString(),
        },
      },
      members: [leaf.toString()],
      rootName: "alice",
      rootTier: tier,
      rootEpoch: 0,
      humanTag,
      contextHash,
      mandates: [],
    };
    const now = BigInt(Math.floor(Date.now() / 1000));
    const m1 = createMandate({
      parent: alice,
      child: orch,
      scope: TRANSLATE,
      budgetCap: 1000n,
      expiry: now + 1000n,
      tier: BigInt(tier),
      epoch: 0n,
      parentHash: 0n,
      humanTag: BigInt(humanTag),
    });
    const m2 = createMandate({
      parent: orch,
      child: tr,
      scope: TRANSLATE,
      budgetCap: 500n,
      expiry: now + 500n,
      tier: BigInt(tier),
      epoch: 0n,
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
    state.members.push(m1.hash.toString(), m2.hash.toString());
    saveState(state, path);

    const prover: IProver = {
      async prove(): Promise<WarrantProof> {
        return { pi_a: [], pi_b: [], pi_c: [] };
      },
    };
    const result = await proveForChallenge({
      state,
      as: "translator",
      challenge: {
        method: "POST",
        path: "/v1/translate",
        nonce: "test-nonce",
        merkleRoot: rebuildGroup(state).root.toString(),
        amount: "100000",
        payTo: "0.0.10311260",
        bodyHash: "",
      },
      prover,
    });
    const header = JSON.parse(warrantHeaderJson(result)) as {
      nonce: string;
      publicSignals: string[];
    };
    assert.equal(header.nonce, "test-nonce");
    assert.equal(header.publicSignals.length, 8);
  });
});

describe("warrant act", function () {
  it("proves then pays with a fake fetch and never posts a key", async function () {
    const { warrantAct } = await import("../src/act.ts");
    const { createMandate, TRANSLATE } = await import("@ronnakamoto/warrant-core");
    const state = emptyState();
    const alice = ensureIdentity(state, "alice", "seed-alice-act");
    const orch = ensureIdentity(state, "orchestrator", "seed-orch-act");
    const tr = ensureIdentity(state, "translator", "seed-tr-act");
    const leaf = hashLeaf(alice.publicKey[0], alice.publicKey[1], 0n, 0n);
    appendLeaf(state, leaf);
    state.rootName = "alice";
    state.rootTier = 0;
    state.rootEpoch = 0;
    state.humanTag = freshFieldTag();
    state.contextHash = freshFieldTag();
    const { humanTag } = requireTags(state);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const m1 = createMandate({
      parent: alice,
      child: orch,
      scope: TRANSLATE,
      budgetCap: 1_000_000n,
      expiry: now + 86400n,
      tier: 0n,
      epoch: 0n,
      parentHash: 0n,
      humanTag: BigInt(humanTag),
    });
    const m2 = createMandate({
      parent: orch,
      child: tr,
      scope: TRANSLATE,
      budgetCap: 100_000n,
      expiry: now + 3600n,
      tier: 0n,
      epoch: 0n,
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
    state.members.push(m1.hash.toString(), m2.hash.toString());

    const payload = {
      extensions: { warrant: { info: { nonce: "n", merkleRoot: rebuildGroup(state).root.toString() } } },
      accepts: [{ scheme: "exact", network: "hedera:testnet", amount: "100000", payTo: "0.0.1" }],
    };
    const headers = new Headers({
      "payment-required": Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    });
    let ensured = 0;
    let paid = 0;
    let postedKey = false;
    const out = await warrantAct(
      "http://shop.test/v1/translate",
      JSON.stringify({ text: "hi", source: "en", target: "es" }),
      {
        state,
        as: "translator",
        prover: {
          async prove() {
            return { pi_a: [], pi_b: [], pi_c: [] };
          },
        },
        ensureArtifacts: () => {
          ensured += 1;
        },
        fetchImpl: async () => new Response(JSON.stringify(payload), { status: 402, headers }),
        createPaymentFetch: () => async (_url, init) => {
          paid += 1;
          const body = typeof init?.body === "string" ? init.body : "";
          if (/hederaPrivateKey|302e|HEDERA_PRIVATE/.test(`${body}${JSON.stringify(init?.headers ?? {})}`)) {
            postedKey = true;
          }
          assert.ok(new Headers(init?.headers).get("warrant"));
          return new Response(JSON.stringify({ text: "hola" }), { status: 200 });
        },
      },
    );
    assert.equal(ensured, 1);
    assert.equal(paid, 1);
    assert.equal(postedKey, false);
    assert.equal(out.status, 200);
    assert.equal(out.text, "hola");
  });

  it("with a Copy bearer pays the BFF and never local-proves or posts a key", async function () {
    const { warrantAct } = await import("../src/act.ts");
    let ensured = 0;
    let proved = 0;
    let postedKey = false;
    const out = await warrantAct(
      "https://warrant-beta.vercel.app/api/agent/memo",
      JSON.stringify({ text: "hi" }),
      {
        bearer: "sess",
        ensureArtifacts: () => {
          ensured += 1;
        },
        prover: {
          async prove() {
            proved += 1;
            return { pi_a: [], pi_b: [], pi_c: [] };
          },
        },
        createPaymentFetch: () => async (_url, init) => {
          const headers = new Headers(init?.headers);
          const blob = `${typeof init?.body === "string" ? init.body : ""}${JSON.stringify(init?.headers ?? {})}`;
          if (/hederaPrivateKey|302e|HEDERA_PRIVATE/.test(blob)) postedKey = true;
          assert.equal(headers.get("authorization"), "Bearer sess");
          assert.equal(headers.get("warrant"), null);
          assert.equal(typeof init?.body === "string" && init.body.includes("hi"), true);
          return new Response(JSON.stringify({ text: "scarred", hashscan: "https://hashscan.io/testnet/transaction/1" }), {
            status: 200,
          });
        },
      },
    );
    assert.equal(ensured, 0);
    assert.equal(proved, 0);
    assert.equal(postedKey, false);
    assert.equal(out.status, 200);
    assert.equal(out.text, "scarred\nhttps://hashscan.io/testnet/transaction/1");
    assert.equal(out.text.includes("sess"), false);
  });

  it("points the skill at warrant act, not a pasted key", async function () {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const skill = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../SKILL.md"), "utf8");
    const postAt = skill.indexOf("POST https://warrant-beta.vercel.app/api/agent/memo");
    const optionalAt = skill.indexOf("Optional");
    assert.ok(postAt >= 0 && postAt < optionalAt);
    assert.match(skill, /warrant act/);
    assert.match(skill, /WARRANT_BEARER/);
    assert.match(skill, /api\/agent\/memo/);
    assert.equal(skill.includes("translate-production"), false);
    assert.match(skill, /warrant ready/);
    assert.match(skill, /17879\/fund/);
    assert.match(skill, /Do not skip/i);
    assert.match(skill, /funded/);
    assert.equal(/Let it spend/i.test(skill), false);
    assert.equal(skill.includes("hederaPrivateKey"), false);
    assert.match(skill, /I cannot sign Hedera from this chat/);
    assert.equal(/npx @warrant\/agent/.test(skill), false);
    assert.equal(skill.includes("npx"), false);
    assert.equal(skill.includes("From a clone"), false);
    assert.match(skill, /Do not install pnpm, npm, or bun/);
    assert.match(skill, /npm exec --yes -- @ronnakamoto\/warrant ready/);
    assert.match(skill, /npm exec --yes -- @ronnakamoto\/warrant act/);
    assert.match(skill, /Do not POST a key/);
    assert.match(skill, /Bearer <the bearer from Copy>/);
  });

  it("publishes the CLI as @ronnakamoto/warrant", async function () {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const pkg = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
    ) as { name?: string; bin?: { warrant?: string }; private?: boolean };
    assert.equal(pkg.name, "@ronnakamoto/warrant");
    assert.equal(pkg.bin?.warrant, "./dist/bin.js");
    assert.equal(pkg.private, undefined);
  });
});

describe("@warrant/agent purse", function () {
  it("init never returns the private key and writes mode 0o600", async function () {
    const { mkdtempSync, statSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { bindPurse, initPurse, pursePublicView } = await import("../src/purse.ts");
    const path = join(mkdtempSync(join(tmpdir(), "warrant-purse-")), "purse.json");
    const purse = initPurse(path);
    const view = pursePublicView(purse);
    assert.equal("privateKey" in view, false);
    assert.equal(JSON.stringify(view).includes(purse.privateKey), false);
    assert.match(view.evmAddress, /^0x[0-9a-f]{40}$/);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const bound = bindPurse(path, { accountId: "0.0.9" });
    assert.deepEqual(pursePublicView(bound), {
      publicKey: purse.publicKey,
      evmAddress: view.evmAddress,
      accountId: "0.0.9",
    });
    const raw = readFileSync(path, "utf8");
    assert.match(raw, /privateKey/);
  });

  it("signs an approved transfer as the spender, not the facilitator", async function () {
    const { inspectHederaTransaction, getNetForAccount } = await import("@x402/hedera");
    const { createAllowanceSigner } = await import("../src/allowance-pay.ts");
    const { PrivateKey } = await import("@x402/hedera");
    const key = PrivateKey.generateECDSA();
    const signer = createAllowanceSigner({
      accountId: "0.0.9",
      vaultAccountId: "0.0.8",
      privateKey: key.toStringRaw(),
    });
    const transaction = await signer.createPartiallySignedTransferTransaction({
      scheme: "exact",
      network: "hedera:testnet",
      amount: "100000",
      payTo: "0.0.1",
      asset: "0.0.0",
      extra: { feePayer: "0.0.7162784" },
    } as never);
    const inspected = inspectHederaTransaction(transaction);
    assert.equal(inspected.transactionIdAccountId, "0.0.9");
    assert.equal(inspected.transactionIdAccountId === "0.0.7162784", false);
    assert.equal(getNetForAccount(inspected.hbarTransfers, "0.0.1").toString(), "100000");
    assert.equal(getNetForAccount(inspected.hbarTransfers, "0.0.8").toString(), "-100000");
  });

  it("ready serves the public key and binds without accepting a private key", async function () {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { ServerResponse } = await import("node:http");
    const { handleReadyRequest, ensurePurse } = await import("../src/ready.ts");
    const { pursePublicView } = await import("../src/purse.ts");
    const path = join(mkdtempSync(join(tmpdir(), "warrant-ready-")), "purse.json");
    const purse = ensurePurse(path);
    const sent: { status?: number; body?: string } = {};
    const res = {
      writeHead(status: number) {
        sent.status = status;
        return this;
      },
      setHeader() {
        return this;
      },
      end(body?: string) {
        sent.body = body;
      },
    } as unknown as InstanceType<typeof ServerResponse>;
    await handleReadyRequest({ method: "GET", url: "/" }, res, undefined, path);
    assert.equal(sent.status, 200);
    const readyBody = JSON.parse(sent.body ?? "{}") as { publicKey: string; evmAddress: string };
    assert.equal(readyBody.publicKey, purse.publicKey);
    assert.equal(readyBody.evmAddress, pursePublicView(purse).evmAddress);
    assert.equal(JSON.stringify(sent.body).includes(purse.privateKey), false);
    await handleReadyRequest(
      { method: "POST", url: "/pair" },
      res,
      { accountId: "0.0.9", vaultAccountId: "0.0.8", privateKey: "no" },
      path,
    );
    assert.equal(sent.status, 400);
    await handleReadyRequest(
      { method: "POST", url: "/pair" },
      res,
      { accountId: "0.0.9", vaultAccountId: "0.0.8" },
      path,
    );
    assert.equal(sent.status, 200);
    assert.deepEqual(JSON.parse(sent.body ?? "{}"), {
      publicKey: purse.publicKey,
      evmAddress: pursePublicView(purse).evmAddress,
      accountId: "0.0.9",
      vaultAccountId: "0.0.8",
    });
  });

  it("binds accountId from the mirror without a vault", async function () {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { initPurse, evmAddressOf, bindPurseFromMirror, pursePublicView } = await import(
      "../src/purse.ts"
    );
    const path = join(mkdtempSync(join(tmpdir(), "warrant-mirror-")), "purse.json");
    const purse = initPurse(path);
    const evm = evmAddressOf(purse);
    const bound = await bindPurseFromMirror(path, async (url) => {
      assert.match(String(url), new RegExp(evm.slice(2), "i"));
      return new Response(JSON.stringify({ account: "0.0.42" }), { status: 200 });
    });
    assert.equal(bound.accountId, "0.0.42");
    assert.equal(bound.vaultAccountId, undefined);
    assert.equal(pursePublicView(bound).evmAddress, evm);
  });

  it("fund page shows the 0x address and never the private key", async function () {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { ServerResponse } = await import("node:http");
    const { handleReadyRequest, ensurePurse } = await import("../src/ready.ts");
    const { evmAddressOf } = await import("../src/purse.ts");
    const path = join(mkdtempSync(join(tmpdir(), "warrant-fund-")), "purse.json");
    const purse = ensurePurse(path);
    const sent: { status?: number; body?: string } = {};
    const res = {
      writeHead(status: number) {
        sent.status = status;
        return this;
      },
      setHeader() {
        return this;
      },
      end(body?: string) {
        sent.body = body;
      },
    } as unknown as InstanceType<typeof ServerResponse>;
    await handleReadyRequest({ method: "GET", url: "/fund" }, res, undefined, path);
    assert.equal(sent.status, 200);
    assert.match(sent.body ?? "", new RegExp(evmAddressOf(purse), "i"));
    assert.match(sent.body ?? "", /2 HBAR/);
    assert.match(sent.body ?? "", /<svg/i);
    assert.match(sent.body ?? "", /fetch\("\/ready"\)/);
    assert.equal((sent.body ?? "").includes(purse.privateKey), false);
  });

  it("notices a fund on the next mirror poll", async function () {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { initPurse, loadPurse, watchPurseFunding } = await import("../src/purse.ts");
    const path = join(mkdtempSync(join(tmpdir(), "warrant-watch-")), "purse.json");
    initPurse(path);
    let hits = 0;
    const accountId = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("watch timed out")), 2000);
      const watch = watchPurseFunding({
        path,
        intervalMs: 20,
        fetchImpl: async () => {
          hits += 1;
          if (hits < 2) return new Response("{}", { status: 404 });
          return new Response(JSON.stringify({ account: "0.0.77" }), { status: 200 });
        },
        onFunded: (id) => {
          clearTimeout(timer);
          watch.stop();
          resolve(id);
        },
      });
    });
    assert.equal(accountId, "0.0.77");
    assert.equal(loadPurse(path)?.accountId, "0.0.77");
  });

  it("does not announce funded for a purse that already has an account", async function () {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { initPurse, bindPurse, watchPurseFunding } = await import("../src/purse.ts");
    const path = join(mkdtempSync(join(tmpdir(), "warrant-already-")), "purse.json");
    initPurse(path);
    bindPurse(path, { accountId: "0.0.10401485" });
    let funded = 0;
    const watch = watchPurseFunding({
      path,
      intervalMs: 20,
      fetchImpl: async () => new Response(JSON.stringify({ account: "0.0.10401485" }), { status: 200 }),
      onFunded: () => {
        funded += 1;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    watch.stop();
    assert.equal(funded, 0);
  });

  it("pays from a funded purse without a vault", async function () {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { initPurse, bindPurse } = await import("../src/purse.ts");
    const { hederaPaymentFetchFromEnv } = await import("../src/act.ts");
    const path = join(mkdtempSync(join(tmpdir(), "warrant-act-")), "purse.json");
    initPurse(path);
    bindPurse(path, { accountId: "0.0.9" });
    const pay = await hederaPaymentFetchFromEnv({ WARRANT_PURSE: path });
    assert.equal(typeof pay, "function");
  });

  it("asks to fund the evm address when the purse has no account", async function () {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { initPurse, evmAddressOf } = await import("../src/purse.ts");
    const { hederaPaymentFetchFromEnv } = await import("../src/act.ts");
    const path = join(mkdtempSync(join(tmpdir(), "warrant-unfunded-")), "purse.json");
    const purse = initPurse(path);
    await assert.rejects(
      () =>
        hederaPaymentFetchFromEnv(
          { WARRANT_PURSE: path },
          async () => new Response("{}", { status: 404 }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /not funded yet/);
        assert.match(err.message, new RegExp(evmAddressOf(purse), "i"));
        return true;
      },
    );
  });
});

describe("isUnboundError", function () {
  it("recognizes Unbound and the forest revert selector", function () {
    assert.equal(isUnboundError(new UnboundError("0xabc")), true);
    assert.equal(
      isUnboundError(new Error('leafOf reverted with the following signature:\n0x74a04f02')),
      true,
    );
    assert.equal(isUnboundError(new Error("already bound")), false);
  });
});

function createGroupRoot(leaf: bigint): bigint {
  return rebuildGroup({
    version: 1,
    identities: {},
    members: [leaf.toString()],
    mandates: [],
  }).root;
}
