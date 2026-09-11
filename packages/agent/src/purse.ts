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
  evmAddress: string;
  accountId?: string;
  vaultAccountId?: string;
};

const ACCOUNT_RE = /^\d+\.\d+\.\d+$/;
export const FUND_HBAR = 2;
export const MIRROR_ACCOUNT_URL = "https://testnet.mirrornode.hedera.com/api/v1/accounts";

export function defaultPursePath(): string {
  return process.env.WARRANT_PURSE ?? join(homedir(), ".warrant", "purse.json");
}

export function parseHederaAccount(raw: string, label = "account"): string {
  const id = raw.trim();
  if (!ACCOUNT_RE.test(id)) throw new Error(`bad Hedera ${label}`);
  return id;
}

export function parsePursePrivateKey(raw: string): PrivateKey {
  return raw.startsWith("0x") || raw.length === 64
    ? PrivateKey.fromStringECDSA(raw)
    : PrivateKey.fromString(raw);
}

export function evmAddressOf(purse: Purse): string {
  const raw = parsePursePrivateKey(purse.privateKey).publicKey.toEvmAddress();
  const hex = raw.replace(/^0x/i, "").toLowerCase();
  return `0x${hex}`;
}

export function pursePublicView(purse: Purse): PursePublic {
  return {
    publicKey: purse.publicKey,
    evmAddress: evmAddressOf(purse),
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

export function requireReadyPurse(path = defaultPursePath()): Purse & { accountId: string } {
  const purse = loadPurse(path);
  if (!purse) throw new Error("no purse — `warrant purse init`");
  if (!purse.accountId) {
    throw new Error("purse is not funded — send HBAR to the 0x address, then warrant act");
  }
  return purse as Purse & { accountId: string };
}

export async function lookupAccountByEvm(
  evmAddress: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const hex = evmAddress.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(hex)) return undefined;
  const res = await fetchImpl(`${MIRROR_ACCOUNT_URL}/0x${hex}`);
  if (!res.ok) return undefined;
  const body = (await res.json().catch(() => ({}))) as { account?: unknown };
  return typeof body.account === "string" && ACCOUNT_RE.test(body.account)
    ? body.account
    : undefined;
}

export const FUND_POLL_MS = 2_000;

/** Bind 0.0.N from the testnet mirror if the 0x alias already exists. */
export async function tryBindPurseFromMirror(
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Purse | undefined> {
  const purse = loadPurse(path);
  if (!purse) return undefined;
  if (purse.accountId) return purse;
  const accountId = await lookupAccountByEvm(evmAddressOf(purse), fetchImpl);
  if (!accountId) return undefined;
  return bindPurse(path, { accountId });
}

/** Bind 0.0.N from the testnet mirror once the 0x alias has been funded. */
export async function bindPurseFromMirror(
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Purse> {
  const purse = await tryBindPurseFromMirror(path, fetchImpl);
  if (purse?.accountId) return purse;
  const existing = loadPurse(path);
  throw new Error(
    existing
      ? `not funded yet — send about ${FUND_HBAR} HBAR to ${evmAddressOf(existing)}`
      : "no purse — `warrant purse init`",
  );
}

/** Poll the mirror until the alias is funded. Does not fire for a purse that already has an account. */
export function watchPurseFunding(opts: {
  path: string;
  fetchImpl?: typeof fetch;
  intervalMs?: number;
  onFunded?: (accountId: string) => void;
}): { stop: () => void } {
  if (loadPurse(opts.path)?.accountId) {
    return { stop() {} };
  }
  let stopped = false;
  let inflight = false;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const tick = async () => {
    if (stopped || inflight) return;
    inflight = true;
    try {
      const purse = await tryBindPurseFromMirror(opts.path, fetchImpl);
      if (purse?.accountId) {
        opts.onFunded?.(purse.accountId);
        stop();
      }
    } catch {
      /* keep waiting */
    } finally {
      inflight = false;
    }
  };
  const timer = setInterval(() => void tick(), opts.intervalMs ?? FUND_POLL_MS);
  void tick();
  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  }
  return { stop };
}
