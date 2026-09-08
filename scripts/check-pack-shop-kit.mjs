#!/usr/bin/env node
/**
 * Prove a stranger can install the shop kit without this monorepo.
 * Packs @ronnakamoto/warrant-core and @ronnakamoto/warrant-x402, installs the tarballs in os.tmpdir(),
 * imports createWarrantShop + SnarkjsVerifier.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const coreDir = join(root, "packages/core");
const x402Dir = join(root, "packages/x402");

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

/** Prefer an absolute pack path as-is; otherwise resolve under dir or lastTgz after a clean start. */
function packedTgz(packOutput, dir) {
  const last = packOutput.trim().split("\n").at(-1)?.trim() ?? "";
  if (last && isAbsolute(last) && existsSync(last)) return last;
  if (last) {
    const joined = join(dir, basename(last));
    if (existsSync(joined)) return joined;
  }
  return lastTgz(dir);
}

const corePkg = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8"));
const x402Pkg = JSON.parse(readFileSync(join(root, "packages/x402/package.json"), "utf8"));
if (corePkg.private === true) {
  console.error("check-pack-shop-kit: @ronnakamoto/warrant-core is still private");
  process.exit(1);
}
if (x402Pkg.private === true) {
  console.error("check-pack-shop-kit: @ronnakamoto/warrant-x402 is still private");
  process.exit(1);
}
if (corePkg.version !== x402Pkg.version) {
  console.error("check-pack-shop-kit: core and x402 versions must match");
  process.exit(1);
}

deleteLeftoverTgz(coreDir);
deleteLeftoverTgz(x402Dir);

run("pnpm --filter @ronnakamoto/warrant-core build", root);
run("pnpm --filter @ronnakamoto/warrant-x402 build", root);

const corePack = execSync("pnpm pack --pack-destination .", {
  cwd: coreDir,
  encoding: "utf8",
});
const x402Pack = execSync("pnpm pack --pack-destination .", {
  cwd: x402Dir,
  encoding: "utf8",
});

const coreTgz = packedTgz(corePack, coreDir);
const x402Tgz = packedTgz(x402Pack, x402Dir);

const dir = mkdtempSync(join(tmpdir(), "warrant-shop-kit-"));
writeFileSync(
  join(dir, "package.json"),
  JSON.stringify({ name: "shop-kit-consumer", private: true, type: "module" }, null, 2),
);
run(`npm install "${coreTgz}" "${x402Tgz}" hono@^4.13.7`, dir);

writeFileSync(
  join(dir, "smoke.mjs"),
  `import { SnarkjsVerifier, FETCH } from "@ronnakamoto/warrant-core";
import { createWarrantShop, warrantHono, FixedRootChecker, MemoryNullifierStore } from "@ronnakamoto/warrant-x402";
if (typeof createWarrantShop !== "function") throw new Error("createWarrantShop");
if (typeof warrantHono !== "function") throw new Error("warrantHono");
if (typeof SnarkjsVerifier.fromPath !== "function") throw new Error("fromPath");
if (FETCH === undefined) throw new Error("FETCH");
const shop = createWarrantShop({
  route: "POST /v1/orders",
  policy: { requireScope: FETCH, minTier: 0, freeCallsPerHuman: 0 },
  amount: "100000",
  payTo: "0.0.1",
  verifier: { async verify() { return false; } },
  roots: new FixedRootChecker(1n),
  getMerkleRoot: () => "1",
  nullifiers: new MemoryNullifierStore(),
  defaultPath: "/v1/orders",
});
if (!shop.http) throw new Error("shop.http");
console.log("check-pack-shop-kit: ok");
`,
);
run("node smoke.mjs", dir);
