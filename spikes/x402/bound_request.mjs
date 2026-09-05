import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";
import { poseidon2, poseidon4, poseidon5 } from "poseidon-lite";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import * as snarkjs from "snarkjs";
import { x402ResourceServer } from "@x402/core/server";
import { x402HTTPResourceServer } from "@x402/core/http";
import { hashChallenge, challengeFromPaymentRequired } from "../lib/challenge-hash.mjs";
import { identity, leafOf, SEEDS } from "../lib/demo-identities.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const spikes = join(here, "..");
const zk = join(spikes, "zk");
const outDir = join(zk, "build");
const circomlib = join(spikes, "node_modules/circomlib/circuits");
const bmr = join(spikes, "node_modules/@zk-kit/binary-merkle-root.circom/src");
const snarkcli = join(spikes, "node_modules/snarkjs/cli.js");
const MAX_DEPTH = 20;
const D = 4;

mkdirSync(outDir, { recursive: true });

function padSiblings(siblings) {
  const out = siblings.map((s) => s.toString());
  while (out.length < MAX_DEPTH) out.push("0");
  return out;
}

function witnessOk(wasm, inputPath, wtnsPath) {
  try {
    execSync(`node ${snarkcli} wtns calculate ${wasm} ${inputPath} ${wtnsPath}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err.stderr || err.message || "").toString().slice(0, 800) };
  }
}

function ensure(name) {
  const wasm = join(outDir, `${name}_js/${name}.wasm`);
  if (existsSync(wasm)) return wasm;
  execSync(
    `circom ${join(zk, "circuits", `${name}.circom`)} --r1cs --wasm --sym -o ${outDir} -l ${circomlib} -l ${bmr}`,
    { stdio: "inherit", maxBuffer: 40_000_000 },
  );
  return wasm;
}

const alice = identity(SEEDS.alice);
const agent = new Identity("spike-agent");
const translator = new Identity("spike-translator");
const dummy = agent;
const tier = 2n;
const epoch = 0n;
const now = BigInt(Math.floor(Date.now() / 1000));
const leaf = leafOf(alice, tier, epoch);
const group = new Group();
group.addMember(leaf);
group.addMember(leafOf(identity(SEEDS.bob), tier, 0n));
group.addMember(leafOf(identity(SEEDS.carol), tier, 0n));
const mProof = group.generateMerkleProof(0);
const currentRoot = group.root.toString();

const nonce = "spike-nonce-1";
const body = JSON.stringify({ text: "reverse this" });
const bodyHash = keccak256(toBytes(body));

const server = new x402ResourceServer("https://api.testnet.blocky402.com");
const warrantExtension = {
  key: "warrant",
  dynamicInfoFields: ["nonce", "issuedAt", "merkleRoot"],
  enrichPaymentRequiredResponse: async () => ({
    info: {
      version: "1",
      nonce,
      issuedAt: "2026-09-04T00:00:00.000Z",
      merkleRoot: currentRoot,
      requireScope: 1,
      minTier: 1,
    },
    schema: { type: "object" },
  }),
};
server.registerExtension(warrantExtension);

const paymentRequired = await server.createPaymentRequiredResponse(
  [
    {
      scheme: "exact",
      network: "hedera:testnet",
      asset: "0.0.0",
      amount: "100000",
      payTo: "0.0.10311260",
      maxTimeoutSeconds: 300,
      extra: { feePayer: "0.0.7162784" },
    },
  ],
  { url: "https://translate.warrant.example/v1/translate", description: "translate" },
  undefined,
  { warrant: { info: { version: "1" }, schema: { type: "object" } } },
);

const challenge = {
  ...challengeFromPaymentRequired(paymentRequired, {
    method: "POST",
    path: "/v1/translate",
    bodyHash,
  }),
};
const requestHash = hashChallenge(challenge);
const wrongHash = hashChallenge({ ...challenge, nonce: "other-nonce" });

const scopes = [7n, 1n, 1n, 1n];
const budgets = [2_000_000n, 200_000n, 200_000n, 200_000n];
const expiries = [now + 86400n, now + 3600n, now + 3600n, now + 3600n];
const enabled = [1, 1, 0, 0];
const children = [agent, translator, dummy, dummy];
const humanTag = 42n;
const contextHash = 99n;

const leanBase = {
  merkleRoot: currentRoot,
  contextHash: contextHash.toString(),
  nullifier: poseidon2([humanTag, contextHash]).toString(),
  effectiveScope: "1",
  effectiveBudgetCap: "200000",
  minExpiry: now.toString(),
  tier: tier.toString(),
  requestHash: requestHash.toString(),
  rootPkX: alice.publicKey[0].toString(),
  rootPkY: alice.publicKey[1].toString(),
  epoch: epoch.toString(),
  merkleDepth: mProof.siblings.length.toString(),
  merkleIndex: mProof.index.toString(),
  siblings: padSiblings(mProof.siblings),
  scopes: scopes.map(String),
  budgets: budgets.map(String),
  expiries: expiries.map(String),
  enabled: enabled.map(String),
  humanTag: humanTag.toString(),
};

const leanWasm = ensure("warrant_lean");
const leanPath = join(outDir, "bound_lean.json");
writeFileSync(leanPath, JSON.stringify(leanBase));
const leanWitness = witnessOk(leanWasm, leanPath, join(outDir, "bound_lean.wtns"));

const zkey = join(outDir, "warrant_lean_final.zkey");
const vkeyPath = join(outDir, "warrant_lean_vkey.json");
let groth16 = null;
if (leanWitness.ok && existsSync(zkey)) {
  if (!existsSync(vkeyPath)) {
    execSync(`node ${snarkcli} zkey export verificationkey ${zkey} ${vkeyPath}`, { stdio: "inherit" });
  }
  const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, join(outDir, "bound_lean.wtns"));
  const vkey = JSON.parse(readFileSync(vkeyPath, "utf8"));
  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  groth16 = { verified, publicSignals, proof, requestHashPublic: publicSignals[7] };
}

const fullWasm = existsSync(join(outDir, "warrant_full_js/warrant_full.wasm"))
  ? join(outDir, "warrant_full_js/warrant_full.wasm")
  : null;

let full = null;
if (fullWasm) {
  const mandateSigs = [];
  for (let i = 0; i < D; i++) {
    const M = poseidon5([
      children[i].publicKey[0],
      children[i].publicKey[1],
      scopes[i],
      budgets[i],
      expiries[i],
    ]);
    const signer = i === 0 ? alice : children[i - 1];
    mandateSigs.push(enabled[i] ? signer.signMessage(M) : alice.signMessage(M));
  }
  const reqSig = translator.signMessage(requestHash);
  const fullInput = {
    ...leanBase,
    childPkX: children.map((c) => c.publicKey[0].toString()),
    childPkY: children.map((c) => c.publicKey[1].toString()),
    sigS: mandateSigs.map((s) => s.S.toString()),
    sigR8x: mandateSigs.map((s) => s.R8[0].toString()),
    sigR8y: mandateSigs.map((s) => s.R8[1].toString()),
    reqS: reqSig.S.toString(),
    reqR8x: reqSig.R8[0].toString(),
    reqR8y: reqSig.R8[1].toString(),
  };
  writeFileSync(join(outDir, "bound_full.json"), JSON.stringify(fullInput));
  const good = witnessOk(fullWasm, join(outDir, "bound_full.json"), join(outDir, "bound_full.wtns"));
  const bad = {
    ...fullInput,
    requestHash: wrongHash.toString(),
  };
  writeFileSync(join(outDir, "bound_full_wrong_nonce.json"), JSON.stringify(bad));
  const wrongNonce = witnessOk(
    fullWasm,
    join(outDir, "bound_full_wrong_nonce.json"),
    join(outDir, "bound_full_wrong_nonce.wtns"),
  );
  full = {
    signedChallengeAccepted: good.ok === true,
    good,
    wrongNonceRejected: wrongNonce.ok === false,
    wrongNonce,
  };
}

const vkey = groth16 ? JSON.parse(readFileSync(vkeyPath, "utf8")) : null;
let liveRoot = currentRoot;

function adapter(headers = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    getHeader: (name) => h[name.toLowerCase()],
    getMethod: () => "POST",
    getPath: () => "/v1/translate",
    getUrl: () => "https://translate.warrant.example/v1/translate",
    getAcceptHeader: () => "application/json",
    getUserAgent: () => "warrant-spike",
  };
}

const http = new x402HTTPResourceServer(server, {
  "POST /v1/translate": {
    accepts: {
      scheme: "exact",
      network: "hedera:testnet",
      asset: "0.0.0",
      amount: "100000",
      payTo: "0.0.10311260",
      maxTimeoutSeconds: 300,
      extra: { feePayer: "0.0.7162784" },
    },
    description: "translate",
    extensions: { warrant: { info: { version: "1" } } },
  },
});

http.onProtectedRequest(async (context) => {
  const header = context.adapter.getHeader("warrant");
  if (!header) return;
  let body;
  try {
    body = JSON.parse(header);
  } catch {
    return { abort: true, reason: "malformed_warrant" };
  }
  if (body.revoked) return { abort: true, reason: "root_revoked" };
  if (!body.publicSignals) {
    return { abort: true, reason: "malformed_warrant" };
  }
  // Instant cascade: currentRoot only. Check this before requestHash so a
  // revoke is not reported as a challenge mismatch (the 402 also embeds merkleRoot).
  if (body.publicSignals[0] !== liveRoot) {
    return { abort: true, reason: "root_revoked" };
  }
  const expected = hashChallenge({
    method: context.adapter.getMethod(),
    path: context.adapter.getPath(),
    nonce,
    merkleRoot: liveRoot,
    amount: "100000",
    payTo: "0.0.10311260",
    bodyHash,
  }).toString();
  if (body.publicSignals[7] !== expected) {
    return { abort: true, reason: "request_hash_mismatch" };
  }
  if (vkey) {
    const ok = await snarkjs.groth16.verify(vkey, body.publicSignals, body.proof);
    if (!ok) return { abort: true, reason: "invalid_proof" };
  }
  return { grantAccess: true };
});

async function run(label, headers) {
  const result = await http.processHTTPRequest({
    adapter: adapter(headers),
    path: "/v1/translate",
    method: "POST",
  });
  return {
    label,
    type: result.type,
    status: result.response?.status,
    reason: result.response?.body,
  };
}

const cases = [];
cases.push(await run("no-header", {}));

if (groth16?.verified) {
  const warrantHeader = JSON.stringify({
    proof: groth16.proof,
    publicSignals: groth16.publicSignals,
  });
  cases.push(await run("valid-bound-proof", { warrant: warrantHeader }));

  const mismatch = JSON.parse(JSON.stringify(groth16.publicSignals));
  mismatch[7] = wrongHash.toString();
  cases.push(
    await run("wrong-challenge-hash", {
      warrant: JSON.stringify({ proof: groth16.proof, publicSignals: mismatch }),
    }),
  );

  liveRoot = (BigInt(currentRoot) + 1n).toString();
  cases.push(await run("root-revoked", { warrant: warrantHeader }));
  liveRoot = currentRoot;
}

const valid = cases.find((c) => c.label === "valid-bound-proof");
const mismatch = cases.find((c) => c.label === "wrong-challenge-hash");
const revoked = cases.find((c) => c.label === "root-revoked");

const result = {
  formula:
    "requestHash = keccak256(method|path|nonce|merkleRoot|amount|payTo|bodyHash) mod r. Leaf EdDSA-signs that field (warrant_full). Groth16 publicSignals[7] must match the live challenge.",
  challenge,
  requestHash: requestHash.toString(),
  wrongHash: wrongHash.toString(),
  merkleRoot: currentRoot,
  leanWitness,
  groth16: groth16
    ? {
        verified: groth16.verified,
        requestHashPublic: groth16.requestHashPublic,
        matchesChallenge: groth16.requestHashPublic === requestHash.toString(),
      }
    : null,
  full,
  cases,
  validIsNoPayment: valid?.type === "no-payment-required",
  mismatchIs403: mismatch?.type === "payment-error" && mismatch?.status === 403,
  mismatchReason: mismatch?.reason?.error ?? null,
  revokedIs403: revoked?.type === "payment-error" && revoked?.status === 403,
  revokedReason: revoked?.reason?.error ?? null,
};

result.ok =
  leanWitness.ok === true &&
  groth16?.verified === true &&
  groth16.requestHashPublic === requestHash.toString() &&
  result.validIsNoPayment &&
  result.mismatchIs403 &&
  result.mismatchReason === "request_hash_mismatch" &&
  result.revokedIs403 &&
  result.revokedReason === "root_revoked" &&
  (full ? full.signedChallengeAccepted && full.wrongNonceRejected : true);

writeFileSync(join(here, "bound-request-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
