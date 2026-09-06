import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  bindPurse,
  defaultPursePath,
  initPurse,
  loadPurse,
  parseHederaAccount,
  pursePublicView,
} from "./purse.js";

export const READY_PORT = 17879;

export type ReadyHandle = {
  close: () => Promise<void>;
  port: number;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  cors(res);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function hasPrivateKey(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const key = (raw as { privateKey?: unknown }).privateKey;
  return typeof key === "string" && key.trim().length > 0;
}

export function ensurePurse(path = defaultPursePath()) {
  return loadPurse(path) ?? initPurse(path);
}

/** Local pair: public ids only. Never accept or return a private key. */
export async function handleReadyRequest(
  req: { method?: string; url?: string },
  res: ServerResponse,
  body: unknown,
  pursePath = defaultPursePath(),
): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();
  const path = (req.url ?? "/").split("?")[0];
  if (method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  if (hasPrivateKey(body)) {
    json(res, 400, { error: "private key not allowed" });
    return;
  }
  if (method === "GET" && (path === "/" || path === "/ready")) {
    const purse = ensurePurse(pursePath);
    json(res, 200, { ready: true, ...pursePublicView(purse) });
    return;
  }
  if (method === "POST" && path === "/pair") {
    const rec = body && typeof body === "object" ? (body as { accountId?: unknown; vaultAccountId?: unknown }) : {};
    try {
      const accountId = parseHederaAccount(typeof rec.accountId === "string" ? rec.accountId : "", "account");
      const vaultAccountId = parseHederaAccount(
        typeof rec.vaultAccountId === "string" ? rec.vaultAccountId : "",
        "vault",
      );
      ensurePurse(pursePath);
      const purse = bindPurse(pursePath, { accountId, vaultAccountId });
      json(res, 200, pursePublicView(purse));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : "bad pair" });
    }
    return;
  }
  json(res, 404, { error: "not found" });
}

export async function startReadyServer(
  opts: { port?: number; pursePath?: string; host?: string } = {},
): Promise<ReadyHandle> {
  const port = opts.port ?? READY_PORT;
  const host = opts.host ?? "127.0.0.1";
  const pursePath = opts.pursePath ?? defaultPursePath();
  ensurePurse(pursePath);
  const server = createServer(async (req, res) => {
    let body: unknown = undefined;
    if (req.method === "POST") {
      const raw = await readBody(req);
      try {
        body = raw.length > 0 ? JSON.parse(raw) : {};
      } catch {
        json(res, 400, { error: "invalid JSON" });
        return;
      }
    }
    await handleReadyRequest(req, res, body, pursePath);
  });
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.on("error", reject);
  });
  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
