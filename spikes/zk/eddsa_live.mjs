import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { poseidon2 } from "poseidon-lite";
import { Identity } from "@semaphore-protocol/identity";

const here = dirname(fileURLToPath(import.meta.url));
const spikes = join(here, "..");
const build = join(here, "build");
const snarkcli = join(spikes, "node_modules/snarkjs/cli.js");
mkdirSync(build, { recursive: true });

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

const id = new Identity("spike-seed");
const M = poseidon2([7n, 1n]);
const sig = id.signMessage(M);
const jsVerify = Identity.verifySignature(M, sig, id.publicKey);

const circomlib = join(spikes, "node_modules/circomlib/circuits");
const wasm = join(build, "eddsa_one_js/eddsa_one.wasm");
if (!existsSync(wasm)) {
  execSync(
    `circom ${join(here, "circuits/eddsa_one.circom")} --r1cs --wasm --sym -o ${build} -l ${circomlib}`,
    { stdio: "inherit" },
  );
}

const good = {
  enabled: "1",
  Ax: id.publicKey[0].toString(),
  Ay: id.publicKey[1].toString(),
  S: sig.S.toString(),
  R8x: sig.R8[0].toString(),
  R8y: sig.R8[1].toString(),
  M: M.toString(),
};
const goodPath = join(build, "eddsa_live.json");
writeFileSync(goodPath, JSON.stringify(good, null, 2));
const goodWitness = witnessOk(wasm, goodPath, join(build, "eddsa_live.wtns"));

const tampered = { ...good, M: poseidon2([7n, 15n]).toString() };
const tamperPath = join(build, "eddsa_live_bad.json");
writeFileSync(tamperPath, JSON.stringify(tampered));
const badWitness = witnessOk(wasm, tamperPath, join(build, "eddsa_live_bad.wtns"));

const disabled = { ...good, enabled: "0", M: "0" };
const disPath = join(build, "eddsa_disabled.json");
writeFileSync(disPath, JSON.stringify(disabled));
const disabledWitness = witnessOk(wasm, disPath, join(build, "eddsa_disabled.wtns"));

const result = {
  jsVerify,
  publicKey: id.publicKey.map(String),
  message: M.toString(),
  signature: { S: sig.S.toString(), R8: sig.R8.map(String) },
  circuitAcceptsZkKitSignature: goodWitness.ok,
  goodWitness,
  tamperedMessageRejected: badWitness.ok === false,
  tamperedWitness: badWitness,
  disabledPaddingAccepted: disabledWitness.ok,
  disabledWitness,
};

writeFileSync(join(here, "artifacts/eddsa-live-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
