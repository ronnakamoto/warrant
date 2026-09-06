import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { PrivateKey } from "@x402/hedera";

export type Purse = {
  version: 1;
  publicKey: string;
  privateKey: string;
  accountId?: string;
  vaultAccountId?: string;
};

export type PursePublic = {
  publicKey: string;
  accountId?: string;
  vaultAccountId?: string;
};

const ACCOUNT_RE = /^\d+\.\d+\.\d+$/;

export function defaultPursePath(): string {
  return process.env.WARRANT_PURSE ?? join(homedir(), ".warrant", "purse.json");
}

export function parseHederaAccount(raw: string, label = "account"): string {
  const id = raw.trim();
  if (!ACCOUNT_RE.test(id)) throw new Error(`bad Hedera ${label}`);
  return id;
}

export function pursePublicView(purse: Purse): PursePublic {
  return {
    publicKey: purse.publicKey,
    ...(purse.accountId ? { accountId: purse.accountId } : {}),
    ...(purse.vaultAccountId ? { vaultAccountId: purse.vaultAccountId } : {}),
  };
}

function warnIfInsecureMode(path: string): void {
  try {
    const mode = statSync(path).mode & 0o777;
    if (mode & 0o077) {
      console.warn(
        `warrant: ${path} is group/world-readable (mode ${mode.toString(8)}); chmod 600 recommended`,
      );
    }
  } catch {
    /* ignore */
  }
}

export function loadPurse(path = defaultPursePath()): Purse | undefined {
  if (!existsSync(path)) return undefined;
  warnIfInsecureMode(path);
  const raw = JSON.parse(readFileSync(path, "utf8")) as Purse;
  if (raw.version !== 1 || typeof raw.privateKey !== "string" || typeof raw.publicKey !== "string") {
    throw new Error("bad purse file");
  }
  return raw;
}

export function savePurse(purse: Purse, path = defaultPursePath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(purse, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort on platforms without chmod */
  }
}

export function initPurse(path = defaultPursePath()): Purse {
  if (existsSync(path)) {
    throw new Error("purse already exists — `warrant purse show`");
  }
  const key = PrivateKey.generateECDSA();
  const purse: Purse = {
    version: 1,
    privateKey: key.toStringRaw(),
    publicKey: key.publicKey.toStringDer(),
  };
  savePurse(purse, path);
  return purse;
}

export function bindPurse(
  path: string,
  patch: { accountId?: string; vaultAccountId?: string },
): Purse {
  const purse = loadPurse(path);
  if (!purse) throw new Error("no purse — `warrant purse init`");
  if (patch.accountId) purse.accountId = parseHederaAccount(patch.accountId, "account");
  if (patch.vaultAccountId) {
    purse.vaultAccountId = parseHederaAccount(patch.vaultAccountId, "vault");
  }
  savePurse(purse, path);
  return purse;
}

export function requireReadyPurse(path = defaultPursePath()): Purse & {
  accountId: string;
  vaultAccountId: string;
} {
  const purse = loadPurse(path);
  if (!purse) throw new Error("no purse — `warrant purse init`");
  if (!purse.accountId || !purse.vaultAccountId) {
    throw new Error(
      "purse is not bound — create it in the tab, then `warrant purse bind --account 0.0.N --vault 0.0.M`",
    );
  }
  return purse as Purse & { accountId: string; vaultAccountId: string };
}

export function parsePursePrivateKey(raw: string): PrivateKey {
  return raw.startsWith("0x") || raw.length === 64
    ? PrivateKey.fromStringECDSA(raw)
    : PrivateKey.fromString(raw);
}
