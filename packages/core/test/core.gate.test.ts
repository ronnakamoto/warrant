import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  TRANSLATE,
  SnarkjsProver,
  SnarkjsVerifier,
  createGroup,
  createMandate,
  hashLeaf,
  keygen,
  prove,
  verify,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const wasm = join(repoRoot, "circuits/build/warrant_js/warrant.wasm");
const zkey = join(repoRoot, "circuits/build/warrant_final.zkey");
const vkey = join(repoRoot, "circuits/build/warrant_vkey.json");
const contractsDir = join(repoRoot, "contracts");

const ANVIL_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function artifactsReady(): boolean {
  return existsSync(wasm) && existsSync(zkey) && existsSync(vkey);
}

async function waitForRpc(rpc: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      execFileSync("cast", ["block-number", "--rpc-url", rpc], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 2000,
      });
      return;
    } catch {
      await delay(150);
    }
  }
  throw new Error(`anvil did not become ready at ${rpc}`);
}

function startAnvil(port: number): ChildProcess {
  return spawn("anvil", ["--port", String(port), "--silent"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function deployRegistry(rpc: string): string {
  const raw = execFileSync(
    "forge",
    [
      "script",
      "script/DeployRegistry.s.sol:DeployRegistry",
      "--rpc-url",
      rpc,
      "--private-key",
      ANVIL_PK,
      "--broadcast",
    ],
    { cwd: contractsDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const match = raw.match(/MandateRegistry\s+(0x[0-9a-fA-F]{40})/);
  if (!match) throw new Error(`forge script: no MandateRegistry address\n${raw}`);
  return match[1]!;
}

function bindAndReadRoot(
  rpc: string,
  registry: string,
  pkX: bigint,
  pkY: bigint,
  tier: number,
): bigint {
  execFileSync(
    "cast",
    [
      "send",
      registry,
      "bindRoot(uint256,uint256,uint8)",
      pkX.toString(),
      pkY.toString(),
      String(tier),
      "--rpc-url",
      rpc,
      "--private-key",
      ANVIL_PK,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const out = execFileSync(
    "cast",
    ["call", registry, "currentRoot()(uint256)", "--rpc-url", rpc],
    { encoding: "utf8" },
  ).trim();
  const decimal = out.split(/\s+/)[0];
  if (!decimal) throw new Error(`currentRoot parse failed: ${out}`);
  return BigInt(decimal);
}

describe("WP4 gate: 2-hop prove + MandateRegistry currentRoot", function () {
  this.timeout(180_000);

  it("proves a 2-hop chain and reads a live currentRoot from anvil", async function () {
    if (!artifactsReady()) this.skip();

    const root = keygen("warrant-wp4-root");
    const agent = keygen("warrant-wp4-agent");
    const translator = keygen("warrant-wp4-translator");
    const now = BigInt(Math.floor(Date.now() / 1000));
    const humanTag = 42n;
    const contextHash = 99n;
    const tier = 2n;
    const epoch = 0n;

    const hop0 = createMandate({
      parent: root,
      child: agent,
      scope: 7n,
      budgetCap: 2_000_000n,
      expiry: now + 86400n,
      tier,
      epoch,
      parentHash: 0n,
      humanTag,
    });
    const hop1 = createMandate({
      parent: agent,
      child: translator,
      scope: TRANSLATE,
      budgetCap: 200_000n,
      expiry: now + 3600n,
      tier,
      epoch,
      parentHash: hop0.hash,
      humanTag,
      parentScope: hop0.scope,
      parentBudgetCap: hop0.budgetCap,
      parentExpiry: hop0.expiry,
    });

    const leaf = hashLeaf(root.publicKey[0], root.publicKey[1], tier, epoch);
    const group = createGroup([leaf, 11n, 22n]);
    const requestHash = 123456789n;

    const prover = new SnarkjsProver(wasm, zkey);
    const verifier = SnarkjsVerifier.fromPath(vkey);
    const { proof, publics } = await prove(
      {
        root,
        children: [agent, translator],
        mandates: [hop0, hop1],
        group,
        leafIndex: 0,
        humanTag,
        contextHash,
        requestHash,
        minExpiry: now,
      },
      prover,
    );

    assert.equal(await verify(proof, publics, verifier), true);
    assert.equal(publics.merkleRoot, group.root);
    assert.notEqual(publics.merkleRoot, 0n);

    const port = 18545 + Math.floor(Math.random() * 400);
    const rpc = `http://127.0.0.1:${port}`;
    const anvil = startAnvil(port);
    try {
      await waitForRpc(rpc);
      const registry = deployRegistry(rpc);
      const currentRoot = bindAndReadRoot(
        rpc,
        registry,
        root.publicKey[0],
        root.publicKey[1],
        Number(tier),
      );
      assert.notEqual(currentRoot, 0n);
      const isCurrent = execFileSync(
        "cast",
        [
          "call",
          registry,
          "isCurrentRoot(uint256)(bool)",
          currentRoot.toString(),
          "--rpc-url",
          rpc,
        ],
        { encoding: "utf8" },
      )
        .trim()
        .split(/\s+/)[0];
      assert.equal(isCurrent, "true");
    } finally {
      anvil.kill("SIGTERM");
    }
  });
});
