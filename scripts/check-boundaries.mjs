#!/usr/bin/env node
/**
 * Encodes the WP0 forbid table from docs/07-architecture.md §2.6.
 * Exit 0 on a clean tree; non-zero on any violation.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  "out",
  "cache",
  "broadcast",
  ".git",
  ".worktrees",
  ".superpowers",
]);

/** Foundry vendor tree only — never skip a product directory named `lib`. */
function isForgeStdVendor(absDir) {
  const rel = posixRel(absDir);
  return rel === "contracts/lib" || rel.startsWith("contracts/lib/");
}

const SOURCE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".sol",
  ".circom",
]);

const TS_JS_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"\n]*from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Forbid table from docs/07 §2.6, plus the binding isolation from
 * docs/05 §2 and docs/07 §2.6:
 *   circuits  ×  contracts  ×  packages   (no imports across these three)
 * apps/* and services/* sit with packages for this constraint.
 *
 * @type {{ from: string, forbid: string[] }[]}
 */
const RULES = [
  {
    from: "packages/core",
    forbid: ["@x402/*", "hono", "next", "@hiero-ledger/*", "viem", "spikes/"],
  },
  {
    from: "packages/x402",
    forbid: ["next", "packages/agent", "services/*", "spikes/"],
  },
  {
    from: "packages/agent",
    forbid: ["hono", "next", "services/*", "spikes/"],
  },
  {
    from: "apps/dashboard",
    forbid: ["snarkjs", "circomlib*", "spikes/", "circuits/"],
  },
  // Tree isolation: packages / apps / services must not import circuits or contracts.
  { from: "packages", forbid: ["circuits/", "contracts/"] },
  { from: "apps", forbid: ["circuits/", "contracts/"] },
  { from: "services", forbid: ["circuits/", "contracts/"] },
  // Circuits and contracts must not pull from packages or each other (TS).
  { from: "circuits", forbid: ["packages/", "contracts/"] },
  { from: "contracts", forbid: ["packages/", "circuits/"] },
];

const PRODUCT_PREFIXES = ["packages/", "apps/", "services/", "scripts/"];

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isForgeStdVendor(full)) continue;
      walk(full, acc);
    } else acc.push(full);
  }
  return acc;
}

function posixRel(abs) {
  return relative(ROOT, abs).split("\\").join("/");
}

function workspacePackages() {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const base of ["packages", "apps", "services"]) {
    const dir = join(ROOT, base);
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const pkgPath = join(dir, name, "package.json");
      try {
        if (!statSync(pkgPath).isFile()) continue;
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.name) map.set(pkg.name, `${base}/${name}`);
      } catch {
        // skip
      }
    }
  }
  return map;
}

const WORKSPACE = workspacePackages();

function packageName(spec) {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.slice(0, 2).join("/");
  }
  return spec.split("/")[0];
}

function resolveSpec(fromFile, spec) {
  if (spec.startsWith(".") || spec.startsWith("/")) {
    return { spec, rel: posixRel(resolve(dirname(fromFile), spec)) };
  }
  const name = packageName(spec);
  const ws = WORKSPACE.get(name);
  if (ws) return { spec, rel: ws };
  return { spec, rel: null };
}

function extractSpecifiers(src) {
  const specs = [];
  for (const match of src.matchAll(IMPORT_RE)) {
    specs.push(match[1] || match[2] || match[3]);
  }
  return specs;
}

/**
 * @param {string} pattern
 * @param {{ spec: string, rel: string | null }} resolved
 */
function matchesPattern(pattern, resolved) {
  const { spec, rel } = resolved;

  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    const bare = pattern.slice(0, -2);
    if (spec === bare || spec.startsWith(prefix)) return true;
    if (rel && (rel === bare || rel.startsWith(prefix))) return true;
    return false;
  }

  if (pattern.endsWith("*") && !pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    return spec === prefix || spec.startsWith(prefix);
  }

  if (pattern.endsWith("/")) {
    if (spec.includes(pattern) || spec.startsWith(pattern.slice(0, -1))) return true;
    if (rel && (rel === pattern.slice(0, -1) || rel.startsWith(pattern))) return true;
    return false;
  }

  if (spec === pattern || spec.startsWith(`${pattern}/`)) return true;
  if (rel && (rel === pattern || rel.startsWith(`${pattern}/`))) return true;
  return false;
}

function rulesFor(fileRel) {
  const matched = RULES.filter(
    (rule) => fileRel === rule.from || fileRel.startsWith(`${rule.from}/`),
  );
  const forbid = new Set(matched.flatMap((rule) => rule.forbid));
  if (PRODUCT_PREFIXES.some((p) => fileRel.startsWith(p))) {
    forbid.add("spikes/");
  }
  return [...forbid];
}

function isProductFile(fileRel) {
  return (
    PRODUCT_PREFIXES.some((p) => fileRel.startsWith(p)) ||
    fileRel.startsWith("contracts/") ||
    fileRel.startsWith("circuits/") ||
    fileRel.startsWith("deployments/")
  );
}

/** @type {string[]} */
const violations = [];

const contractsDir = join(ROOT, "contracts");
for (const file of walk(contractsDir)) {
  if (TS_JS_EXT.has(extname(file))) {
    violations.push(
      `${posixRel(file)}: contracts/ must not contain TypeScript or JavaScript`,
    );
  }
}

const scanRoots = [
  "packages",
  "apps",
  "services",
  "scripts",
  "contracts",
  "circuits",
  "deployments",
];

for (const root of scanRoots) {
  const absRoot = join(ROOT, root);
  for (const file of walk(absRoot)) {
    const fileRel = posixRel(file);
    const ext = extname(file);

    if (file.endsWith("package.json")) {
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        continue;
      }
      const deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
        ...pkg.optionalDependencies,
      };
      const forbid = rulesFor(fileRel);
      for (const name of Object.keys(deps)) {
        const resolved = { spec: name, rel: WORKSPACE.get(name) ?? null };
        for (const pattern of forbid) {
          if (matchesPattern(pattern, resolved)) {
            violations.push(
              `${fileRel}: dependency "${name}" is forbidden (${pattern})`,
            );
          }
        }
      }
      continue;
    }

    if (!SOURCE_EXT.has(ext)) continue;
    const src = readFileSync(file, "utf8");
    const forbid = rulesFor(fileRel);
    if (isProductFile(fileRel) && !forbid.includes("spikes/")) {
      forbid.push("spikes/");
    }

    for (const spec of extractSpecifiers(src)) {
      const resolved = resolveSpec(file, spec);
      for (const pattern of forbid) {
        if (matchesPattern(pattern, resolved)) {
          violations.push(
            `${fileRel}: import "${spec}" is forbidden (${pattern})`,
          );
        }
      }
    }
  }
}

if (violations.length > 0) {
  for (const line of violations) console.error(line);
  console.error(`check-boundaries: ${violations.length} violation(s)`);
  process.exit(1);
}

console.log("check-boundaries: ok");
