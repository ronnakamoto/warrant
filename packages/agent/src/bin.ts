#!/usr/bin/env node
/**
 * Published CLI: ready + act with a Copy bearer. No local prove, no keys printed.
 */
import {
  bindPurse,
  defaultPursePath,
  initPurse,
  loadPurse,
  pursePublicView,
} from "./purse.js";
import { startReadyServer } from "./ready.js";
import { warrantPay } from "./pay.js";

function usage(): never {
  console.error(`warrant — agent CLI

Usage:
  warrant ready [--port 17879] [--purse <path>]
  warrant act --url <url> [--body <json>] [--bearer <session>]
  warrant status [--purse <path>]
  warrant purse init | show | bind --account 0.0.N [--vault 0.0.M]

Purse: $WARRANT_PURSE (default ~/.warrant/purse.json) — never printed
Ready: http://127.0.0.1:17879 — public ids only
Hosted leaf: --bearer or WARRANT_BEARER (Copy). Never print keys.
`);
  process.exit(2);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args[i + 1];
}

function requireFlag(args: string[], name: string): string {
  const v = flag(args, name);
  if (!v) {
    console.error(`missing ${name}`);
    usage();
  }
  return v;
}

async function cmdReady(args: string[]): Promise<void> {
  const path = flag(args, "--purse") ?? defaultPursePath();
  const port = Number(flag(args, "--port") ?? 17879);
  const { ensurePurse } = await import("./ready.js");
  const purse = ensurePurse(path);
  const view = pursePublicView(purse);
  const handle = await startReadyServer({ port, pursePath: path });
  console.log(
    JSON.stringify(
      {
        ...view,
        ready: `http://127.0.0.1:${handle.port}`,
        fund: `http://127.0.0.1:${handle.port}/fund`,
        next: "Always show the human the evmAddress and fund URL before acting. Do not skip if this JSON already has accountId. Never print keys.",
      },
      null,
      2,
    ),
  );
  await new Promise<void>((resolve) => {
    const stop = () => {
      void handle.close().finally(() => resolve());
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

function cmdStatus(args: string[]): void {
  const path = flag(args, "--purse") ?? defaultPursePath();
  const purse = loadPurse(path);
  if (!purse) {
    console.error("no purse — warrant ready");
    process.exit(1);
  }
  console.log(JSON.stringify(pursePublicView(purse), null, 2));
}

function cmdPurse(args: string[]): void {
  const sub = args[0];
  const rest = args.slice(1);
  const path = flag(rest, "--store") ?? flag(rest, "--purse") ?? defaultPursePath();
  if (sub === "init") {
    const purse = initPurse(path);
    console.log(
      JSON.stringify(
        {
          ...pursePublicView(purse),
          next: "Show the human the evmAddress. They send about 2 HBAR, then warrant act.",
        },
        null,
        2,
      ),
    );
    return;
  }
  if (sub === "show") {
    const purse = loadPurse(path);
    if (!purse) {
      console.error("no purse — warrant purse init");
      process.exit(1);
    }
    console.log(JSON.stringify(pursePublicView(purse), null, 2));
    return;
  }
  if (sub === "bind") {
    const account = requireFlag(rest, "--account");
    const vault = flag(rest, "--vault");
    const purse = bindPurse(path, {
      accountId: account,
      ...(vault ? { vaultAccountId: vault } : {}),
    });
    console.log(JSON.stringify(pursePublicView(purse), null, 2));
    return;
  }
  console.error(`warrant purse init | show | bind --account 0.0.N [--vault 0.0.M]`);
  process.exit(2);
}

async function cmdAct(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    console.log(`warrant act — pay ExactHedera, retry

Usage:
  warrant act --url <url> [--body <json>] [--bearer <session>]

Pay: local purse. Human sends HBAR to the 0x address. Never print keys.
Hosted leaf: --bearer or WARRANT_BEARER (Copy). Warrant still proves.
Prints the shop text and HashScan link.
`);
    return;
  }
  const url = requireFlag(args, "--url");
  const memoBody = url.includes("/api/agent/memo")
    ? JSON.stringify({ text: "Good morning." })
    : JSON.stringify({ text: "Good morning.", source: "en", target: "es" });
  const body = flag(args, "--body") ?? memoBody;
  const bearer = (flag(args, "--bearer") ?? process.env.WARRANT_BEARER)?.trim();
  if (!bearer) {
    console.error("missing --bearer or WARRANT_BEARER");
    process.exit(2);
  }
  const out = await warrantPay(url, body, bearer);
  if (out.status === 200) {
    console.log(out.text);
    return;
  }
  console.error(out.text);
  process.exit(1);
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "-h" || cmd === "--help") usage();
  switch (cmd) {
    case "ready":
      await cmdReady(rest);
      break;
    case "status":
      cmdStatus(rest);
      break;
    case "act":
      await cmdAct(rest);
      break;
    case "purse":
      cmdPurse(rest);
      break;
    default:
      console.error(`unknown command: ${cmd}`);
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
