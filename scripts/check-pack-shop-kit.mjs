#!/usr/bin/env node
/**
 * Prove a stranger can install the shop kit without this monorepo.
 * Packs @warrant/core and @warrant/x402, installs the tarballs in os.tmpdir(),
 * imports createWarrantShop + SnarkjsVerifier.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit" });
}

const corePkg = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8"));
const x402Pkg = JSON.parse(readFileSync(join(root, "packages/x402/package.json"), "utf8"));
if (corePkg.private === true) {
  console.error("check-pack-shop-kit: @warrant/core is still private");
  process.exit(1);
}
if (x402Pkg.private === true) {
  console.error("check-pack-shop-kit: @warrant/x402 is still private");
  process.exit(1);
}
if (corePkg.version !== x402Pkg.version) {
  console.error("check-pack-shop-kit: core and x402 versions must match");
  process.exit(1);
}

run("pnpm --filter @warrant/core build", root);
run("pnpm --filter @warrant/x402 build", root);

const corePack = execSync("pnpm pack --pack-destination .", {
  cwd: join(root, "packages/core"),
  encoding: "utf8",
}).trim().split("\n").at(-1);
const x402Pack = execSync("pnpm pack --pack-destination .", {
  cwd: join(root, "packages/x402"),
  encoding: "utf8",
}).trim().split("\n").at(-1);

const coreTgz = join(root, "packages/core", corePack.replace(/.*\//, ""));
const x402Tgz = join(root, "packages/x402", x402Pack.replace(/.*\//, ""));

const dir = mkdtempSync(join(tmpdir(), "warrant-shop-kit-"));
writeFileSync(
  join(dir, "package.json"),
  JSON.stringify({ name: "shop-kit-consumer", private: true, type: "module" }, null, 2),
);
run(`npm install "${coreTgz}" "${x402Tgz}" hono@^4.13.7`, dir);

writeFileSync(
  join(dir, "smoke.mjs"),
  `import { SnarkjsVerifier, FETCH } from "@warrant/core";
import { createWarrantShop, warrantHono, FixedRootChecker, MemoryNullifierStore } from "@warrant/x402";
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
