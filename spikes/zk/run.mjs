import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(here, "build");
const lib = join(root, "node_modules/circomlib/circuits");
mkdirSync(outDir, { recursive: true });

function compile(name) {
  const circom = join(here, "circuits", `${name}.circom`);
  const t0 = Date.now();
  const cmd = `circom ${circom} --r1cs --wasm --sym -o ${outDir} -l ${lib}`;
  const log = execSync(cmd, { encoding: "utf8", maxBuffer: 20_000_000 });
  const ms = Date.now() - t0;
  const info = execSync(`node ${join(root, "node_modules/snarkjs/cli.js")} r1cs info ${join(outDir, name + ".r1cs")}`, {
    encoding: "utf8",
  });
  return { name, compileMs: ms, log: log.trim(), info: info.trim() };
}

const results = [];
for (const name of ["warrant_core", "eddsa_one"]) {
  console.error(`compiling ${name}...`);
  results.push(compile(name));
}

writeFileSync(join(here, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
