import { randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  keygen,
  createGroup,
  createMandate,
  hashLeaf,
  TRANSLATE,
  FETCH,
  TRADE,
  type Identity,
  type SignedMandate,
} from "@warrant/core";

export type StoredIdentity = {
  privateKey: string;
  pkX: string;
  pkY: string;
};

export type StoredMandate = {
  from: string;
  to: string;
  scope: string;
  budgetCap: string;
  expiry: string;
  tier: string;
  epoch: string;
  parentHash: string;
  humanTag: string;
  hash: string;
  signature: { S: string; R8x: string; R8y: string };
};

export type WarrantState = {
  version: 1;
  identities: Record<string, StoredIdentity>;
  /** Ordered leaf bigints as decimal strings (LeanIMT / Semaphore group members). */
  members: string[];
  rootName?: string;
  rootWallet?: string;
  rootTier?: number;
  rootEpoch?: number;
  /**
   * Nullifier tag — AgentBook human id when tier>0, else a session tag (tier=0 demo).
   * Nullifier = Poseidon(humanTag, contextHash).
   */
  humanTag?: string;
  /** Per-root context — set at bind-root alongside humanTag. */
  contextHash?: string;
  mandates: StoredMandate[];
};

const SCOPE_NAMES: Record<string, bigint> = {
  translate: TRANSLATE,
  fetch: FETCH,
  trade: TRADE,
};

/** Fresh field-safe tag (31 random bytes → decimal string). */
export function freshFieldTag(): string {
  return BigInt(`0x${randomBytes(31).toString("hex")}`).toString();
}

export function parseScope(spec: string): bigint {
  let bits = 0n;
  for (const part of spec.split(/[,+\s]+/).filter(Boolean)) {
    const named = SCOPE_NAMES[part.toLowerCase()];
    if (named !== undefined) {
      bits |= named;
      continue;
    }
    if (/^\d+$/.test(part)) {
      bits |= BigInt(part);
      continue;
    }
    throw new Error(`unknown scope bit: ${part}`);
  }
  if (bits === 0n) throw new Error("scope must be non-zero");
  return bits;
}

export function parseTtl(ttl: string): bigint {
  const m = /^(\d+)(s|m|h|d)?$/i.exec(ttl.trim());
  if (!m) throw new Error(`bad ttl: ${ttl}`);
  const n = BigInt(m[1]!);
  const unit = (m[2] ?? "s").toLowerCase();
  const mult =
    unit === "s" ? 1n : unit === "m" ? 60n : unit === "h" ? 3600n : 86400n;
  return BigInt(Math.floor(Date.now() / 1000)) + n * mult;
}

export function defaultStorePath(): string {
  return process.env.WARRANT_STORE ?? join(homedir(), ".warrant", "state.json");
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

export function emptyState(): WarrantState {
  return {
    version: 1,
    identities: {},
    members: [],
    mandates: [],
  };
}

export function loadState(path = defaultStorePath()): WarrantState {
  if (!existsSync(path)) return emptyState();
  warnIfInsecureMode(path);
  const raw = JSON.parse(readFileSync(path, "utf8")) as WarrantState;
  // Strip legacy shared demo defaults if somehow still present without a root
  if (!raw.rootName && (raw.humanTag === "42" || raw.contextHash === "99")) {
    delete raw.humanTag;
    delete raw.contextHash;
  }
  return raw;
}

export function saveState(state: WarrantState, path = defaultStorePath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort on platforms without chmod */
  }
}

export function identityOf(state: WarrantState, name: string): Identity {
  const row = state.identities[name];
  if (!row) throw new Error(`unknown identity: ${name}`);
  return keygen(row.privateKey);
}

export function ensureIdentity(state: WarrantState, name: string, seed?: string): Identity {
  if (state.identities[name]) return identityOf(state, name);
  const id = keygen(seed ?? `${name}-${randomBytes(16).toString("hex")}`);
  state.identities[name] = {
    privateKey: String(id.privateKey),
    pkX: id.publicKey[0].toString(),
    pkY: id.publicKey[1].toString(),
  };
  return id;
}

export function rebuildGroup(state: WarrantState) {
  return createGroup(state.members.map((m) => BigInt(m)));
}

/** Rebuild mandates via createMandate so tagCommitment matches circuit. */
export function replayMandates(state: WarrantState): SignedMandate[] {
  const out: SignedMandate[] = [];
  for (const m of state.mandates) {
    const parent = identityOf(state, m.from);
    const child = identityOf(state, m.to);
    const signed = createMandate({
      parent,
      child,
      scope: BigInt(m.scope),
      budgetCap: BigInt(m.budgetCap),
      expiry: BigInt(m.expiry),
      tier: BigInt(m.tier),
      epoch: BigInt(m.epoch),
      parentHash: BigInt(m.parentHash),
      humanTag: BigInt(m.humanTag),
    });
    if (signed.hash !== BigInt(m.hash)) {
      throw new Error(`mandate hash drift for ${m.from}→${m.to}`);
    }
    out.push(signed);
  }
  return out;
}

export function appendLeaf(state: WarrantState, leaf: bigint): number {
  const idx = state.members.length;
  state.members.push(leaf.toString());
  return idx;
}

export function requireTags(state: WarrantState): { humanTag: string; contextHash: string } {
  if (!state.humanTag || !state.contextHash) {
    throw new Error("missing humanTag/contextHash — run warrant bind-root first");
  }
  return { humanTag: state.humanTag, contextHash: state.contextHash };
}

export { hashLeaf, TRANSLATE };
