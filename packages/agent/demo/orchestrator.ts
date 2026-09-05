/** Orchestrator agent — attenuates and hands work to translator. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../src/cli.ts");

function warrant(args: string[]): void {
  const r = spawnSync("pnpm", ["exec", "tsx", cli, ...args], {
    stdio: "inherit",
    cwd: join(here, ".."),
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const to = process.argv[2] ?? "translator";
warrant([
  "delegate",
  "--from",
  "orchestrator",
  "--to",
  to,
  "--scope",
  "translate",
  "--budget",
  process.env.WARRANT_BUDGET ?? "200000",
  "--ttl",
  process.env.WARRANT_TTL ?? "1h",
]);
console.log(JSON.stringify({ agent: "orchestrator", delegatedTo: to }));
