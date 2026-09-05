import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("WP5 smell gate", function () {
  it("product src never uses onBeforeVerify or skip: true", function () {
    const dirs = [
      join(root, "src"),
      join(root, "../../services/translate/src"),
    ];
    for (const dir of dirs) {
      for (const file of walk(dir)) {
        const text = readFileSync(file, "utf8");
        // Strip line comments so doc mentions of onBeforeVerify are allowed
        const code = text
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .split("\n")
          .filter((l) => !/^\s*\/\//.test(l))
          .join("\n");
        assert.ok(
          !/\bonBeforeVerify\b/.test(code),
          `${file}: must not call onBeforeVerify`,
        );
        assert.ok(!/\bskip:\s*true\b/.test(code), `${file}: must not use skip: true`);
        assert.ok(!/from\s+['"][^'"]*spikes\//.test(code), `${file}: no spikes imports`);
      }
    }
  });
});
