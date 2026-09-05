import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
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
  type WarrantProof,
  type PublicInputs,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const wasm = join(repoRoot, "circuits/build/warrant_js/warrant.wasm");
const zkey = join(repoRoot, "circuits/build/warrant_final.zkey");
const vkey = join(repoRoot, "circuits/build/warrant_vkey.json");
const contractsDir = join(repoRoot, "contracts");

const ANVIL_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ANVIL_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

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

function deploy(rpc: string): { registry: string; gate: string } {
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
    {
      cwd: contractsDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, WARRANT_BIND_OPERATOR: ANVIL_ADDR },
    },
  );
  const registry = raw.match(/MandateRegistry\s+(0x[0-9a-fA-F]{40})/)?.[1];
  const gate = raw.match(/WarrantGate\s+(0x[0-9a-fA-F]{40})/)?.[1];
  if (!registry || !gate) throw new Error(`forge script parse failed\n${raw}`);
  return { registry, gate };
}

function bindRoot(
  rpc: string,
  registry: string,
  wallet: string,
  pkX: bigint,
  pkY: bigint,
  tier: number,
): bigint {
  execFileSync(
    "cast",
    [
      "send",
      registry,
      "bindRoot(address,uint256,uint256,uint8)",
      wallet,
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
  return BigInt(out.split(/\s+/)[0]!);
}

/** snarkjs proof → cast args for WarrantGate.verify */
async function gateVerifyArgs(
  proof: WarrantProof,
  publics: PublicInputs,
): Promise<string[]> {
  const pubArr = [
    publics.merkleRoot,
    publics.contextHash,
    publics.nullifier,
    publics.effectiveScope,
    publics.effectiveBudgetCap,
    publics.minExpiry,
    publics.tier,
    publics.requestHash,
  ].map(String);
  const calldata = await snarkjs.groth16.exportSolidityCallData(
    {
      pi_a: proof.pi_a,
      pi_b: proof.pi_b,
      pi_c: proof.pi_c,
      protocol: proof.protocol ?? "groth16",
      curve: proof.curve ?? "bn128",
    },
    pubArr,
  );
  const [pA, pB, pC, pubs] = JSON.parse(`[${calldata}]`) as [
    string[],
    string[][],
    string[],
    string[],
  ];
  return [
    "verify(uint256[2],uint256[2][2],uint256[2],uint256[8],uint256)",
    `[${pA.join(",")}]`,
    `[[${pB[0]!.join(",")}],[${pB[1]!.join(",")}]]`,
    `[${pC.join(",")}]`,
    `[${pubs.join(",")}]`,
    publics.requestHash.toString(),
  ];
}

describe("WP4 gate: 2-hop prove + on-chain WarrantGate", function () {
  this.timeout(180_000);

  it("proves, binds under operator, and passes WarrantGate.verify with requestHash", async function () {
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
    const group = createGroup([leaf]);
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

    const port = 18545 + Math.floor(Math.random() * 400);
    const rpc = `http://127.0.0.1:${port}`;
    const anvil = startAnvil(port);
    try {
      await waitForRpc(rpc);
      const { registry, gate } = deploy(rpc);
      const currentRoot = bindRoot(
        rpc,
        registry,
        ANVIL_ADDR,
        root.publicKey[0],
        root.publicKey[1],
        Number(tier),
      );
      assert.equal(currentRoot, publics.merkleRoot);

      const args = await gateVerifyArgs(proof, publics);
      const okRaw = execFileSync(
        "cast",
        ["call", gate, ...args, "--rpc-url", rpc],
        { encoding: "utf8" },
      ).trim();
      const ok = okRaw.split(/\s+/)[0]!;
      assert.ok(ok === "true" || ok === "0x1" || /0x0*1$/.test(ok), `gate.verify returned ${okRaw}`);

      // Wrong challenge must fail
      const badArgs = [...args];
      badArgs[badArgs.length - 1] = (publics.requestHash + 1n).toString();
      let rejected = false;
      try {
        execFileSync("cast", ["call", gate, ...badArgs, "--rpc-url", rpc], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {
        rejected = true;
      }
      assert.equal(rejected, true, "expectedRequestHash mismatch must revert");
    } finally {
      anvil.kill("SIGTERM");
    }
  });
});
