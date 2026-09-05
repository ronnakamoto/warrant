/** Translator agent — calls the protected translate resource via warrant.fetch. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../src/cli.ts");
const url = process.env.TRANSLATE_URL ?? "http://127.0.0.1:8787/v1/translate";
const body = process.env.TRANSLATE_BODY ?? JSON.stringify({ text: "hello from translator" });

const r = spawnSync(
  "pnpm",
  ["exec", "tsx", cli, "fetch", "--as", "translator", "--url", url, "--body", body],
  { stdio: "inherit", cwd: join(here, "..") },
);
process.exit(r.status ?? 1);
