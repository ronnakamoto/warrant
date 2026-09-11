#!/usr/bin/env node
/**
 * Prove a stranger can run the agent CLI without this monorepo.
 * Packs @ronnakamoto/warrant, installs the tarball in os.tmpdir(),
 * runs `warrant` and expects usage that names ready.
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const agentDir = join(root, "packages/agent");

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit" });
}

function lastTgz(dir) {
  const names = readdirSync(dir).filter((n) => n.endsWith(".tgz"));
  if (names.length === 0) throw new Error(`no tgz in ${dir}`);
  names.sort();
  return join(dir, names.at(-1));
}

function deleteLeftoverTgz(dir) {
  for (const n of readdirSync(dir).filter((name) => name.endsWith(".tgz"))) {
    unlinkSync(join(dir, n));
  }
}

function packedTgz(packOutput, dir) {
  const last = packOutput.trim().split("\n").at(-1)?.trim() ?? "";
  if (last && isAbsolute(last) && existsSync(last)) return last;
  if (last) {
    const joined = join(dir, basename(last));
    if (existsSync(joined)) return joined;
  }
  return lastTgz(dir);
}

const pkg = JSON.parse(readFileSync(join(agentDir, "package.json"), "utf8"));
if (pkg.private === true) {
  console.error("check-pack-cli: @ronnakamoto/warrant is still private");
  process.exit(1);
}
if (pkg.name !== "@ronnakamoto/warrant") {
  console.error("check-pack-cli: package name must be @ronnakamoto/warrant");
  process.exit(1);
}
if (pkg.bin?.warrant !== "./dist/bin.js") {
  console.error("check-pack-cli: bin.warrant must be ./dist/bin.js");
  process.exit(1);
}

deleteLeftoverTgz(agentDir);
run("pnpm --filter @ronnakamoto/warrant build", root);
const packOut = execSync("pnpm pack --pack-destination .", {
  cwd: agentDir,
  encoding: "utf8",
});
const tgz = packedTgz(packOut, agentDir);

const dir = mkdtempSync(join(tmpdir(), "warrant-cli-"));
execSync("npm init -y", { cwd: dir, stdio: "pipe" });
run(`npm install "${tgz}"`, dir);

const bin = join(dir, "node_modules", ".bin", "warrant");
if (!existsSync(bin)) {
  console.error("check-pack-cli: warrant bin missing after install");
  process.exit(1);
}

let usage = "";
let status = 0;
try {
  usage = execFileSync(bin, [], { encoding: "utf8", cwd: dir }).toString();
} catch (err) {
  status = typeof err.status === "number" ? err.status : 1;
  usage = `${err.stdout ?? ""}${err.stderr ?? ""}`;
}
if (status !== 2) {
  console.error(`check-pack-cli: expected exit 2 from warrant, got ${status}\n${usage}`);
  process.exit(1);
}
if (!/warrant ready/.test(usage) || /\bnpx\b/.test(usage)) {
  console.error(`check-pack-cli: usage must name ready and not npx\n${usage}`);
  process.exit(1);
}
console.log("check-pack-cli: ok");
