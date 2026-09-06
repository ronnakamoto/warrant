import {
  AccountAllowanceApproveTransaction,
  AccountCreateTransaction,
  AccountId,
  Hbar,
  KeyList,
  PublicKey,
  TransactionId,
} from "@hiero-ledger/sdk";
import { createHederaClient } from "@x402/hedera";
import { connectHashPack, WalletRejectedError } from "./hedera-hashpack";

const TESTNET = "hedera:testnet";

/** Small cap. Hedera allowances have no expiry — re-approve often. */
export const DEFAULT_SPEND_HBAR = 2;
/** Fee float so the spender can be the fee payer. Not the shop payment. */
export const FEE_FLOAT_HBAR = 0.05;

const ACCOUNT_RE = /^\d+\.\d+\.\d+$/;

export function parseAgentAccount(raw: string): string {
  const id = raw.trim();
  if (!ACCOUNT_RE.test(id)) throw new Error("Need a Hedera account like 0.0.123");
  return id;
}

function isReject(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /reject|denied|user abort|closed|cancel/i.test(msg);
}

export function transactionIdFromExecute(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const rec = result as { transactionId?: { toString?: () => string } | string };
  const id = typeof rec.transactionId === "string" ? rec.transactionId : rec.transactionId?.toString?.();
  return id && id.includes("@") ? id : undefined;
}

function accountIdFromExecute(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const rec = result as {
    accountId?: { toString?: () => string } | string;
    receipt?: { accountId?: { toString?: () => string } | string };
  };
  const direct = rec.accountId;
  if (typeof direct === "string" && ACCOUNT_RE.test(direct)) return direct;
  if (direct && typeof direct.toString === "function") {
    const id = direct.toString();
    if (ACCOUNT_RE.test(id)) return id;
  }
  const fromReceipt = rec.receipt?.accountId;
  if (typeof fromReceipt === "string" && ACCOUNT_RE.test(fromReceipt)) return fromReceipt;
  if (fromReceipt && typeof fromReceipt.toString === "function") {
    const id = fromReceipt.toString();
    if (ACCOUNT_RE.test(id)) return id;
  }
  return undefined;
}

async function executeWithReceipt(api: {
  execute: (tx: unknown) => Promise<unknown>;
}, tx: unknown): Promise<unknown> {
  const result = await api.execute(tx);
  if (result && typeof result === "object" && "getReceipt" in result) {
    const rec = result as { getReceipt?: (client: unknown) => Promise<unknown> };
    if (typeof rec.getReceipt === "function") {
      const client = createHederaClient(TESTNET);
      try {
        return await rec.getReceipt(client);
      } finally {
        client.close();
      }
    }
  }
  return result;
}

async function accountIdFromMirror(transactionId?: string): Promise<string | undefined> {
  if (!transactionId) return undefined;
  const dash = transactionId.replace("@", "-").replace(/\.(?=\d+$)/, "-");
  const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/transactions/${dash}`);
  if (!res.ok) return undefined;
  const body = (await res.json().catch(() => ({}))) as {
    transactions?: Array<{ entity_id?: string }>;
  };
  const entity = body.transactions?.[0]?.entity_id;
  return typeof entity === "string" && ACCOUNT_RE.test(entity) ? entity : undefined;
}

export async function createPurseOnChain(
  publicKeyDer: string,
): Promise<{ accountId: string; vaultAccountId: string }> {
  const key = publicKeyDer.trim();
  if (key.length < 16) throw new Error("Need the agent public key from warrant purse init");
  const api = await connectHashPack();
  const agentKey = PublicKey.fromString(key);
  let accountKey: PublicKey | KeyList = agentKey;
  try {
    const human = api.accountKey();
    if (human) accountKey = new KeyList([human as PublicKey, agentKey], 1);
  } catch {
    accountKey = agentKey;
  }
  const owner = AccountId.fromString(api.accountId);
  const tx = new AccountCreateTransaction()
    .setKeyWithoutAlias(accountKey)
    .setInitialBalance(new Hbar(FEE_FLOAT_HBAR))
    .setTransactionId(TransactionId.generate(owner));
  const client = createHederaClient(TESTNET);
  try {
    tx.freezeWith(client);
    const signed = await api.signTransaction(tx);
    const receipt = await executeWithReceipt(api, signed);
    const accountId =
      accountIdFromExecute(receipt) ??
      (await accountIdFromMirror(transactionIdFromExecute(receipt)));
    if (!accountId) throw new Error("HashPack created the purse but did not return an account");
    return { accountId, vaultAccountId: api.accountId };
  } catch (err) {
    if (err instanceof WalletRejectedError) throw err;
    if (isReject(err)) throw new WalletRejectedError();
    throw err;
  } finally {
    client.close();
  }
}

export async function approveSpendOnChain(spenderAccount: string): Promise<void> {
  const spender = parseAgentAccount(spenderAccount);
  const api = await connectHashPack();
  const owner = AccountId.fromString(api.accountId);
  const tx = new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(owner, spender, new Hbar(DEFAULT_SPEND_HBAR))
    .setTransactionId(TransactionId.generate(owner));
  const client = createHederaClient(TESTNET);
  try {
    tx.freezeWith(client);
    const signed = await api.signTransaction(tx);
    await executeWithReceipt(api, signed);
  } catch (err) {
    if (err instanceof WalletRejectedError) throw err;
    if (isReject(err)) throw new WalletRejectedError();
    throw err;
  } finally {
    client.close();
  }
}

export async function grantSpendOnChain(
  publicKeyDer: string,
): Promise<{ accountId: string; vaultAccountId: string }> {
  const created = await createPurseOnChain(publicKeyDer);
  await approveSpendOnChain(created.accountId);
  return created;
}

export class ReadyNeededError extends Error {
  constructor() {
    super("Need warrant ready on this machine");
    this.name = "ReadyNeededError";
  }
}

export class PairFallbackError extends Error {
  readonly accountId: string;
  readonly vaultAccountId: string;
  constructor(ids: { accountId: string; vaultAccountId: string }) {
    super("Could not pair the purse on this machine");
    this.name = "PairFallbackError";
    this.accountId = ids.accountId;
    this.vaultAccountId = ids.vaultAccountId;
  }
}

export async function pairReadyPurse(
  ids: { accountId: string; vaultAccountId: string },
  origin = "http://127.0.0.1:17879",
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const body = {
    accountId: parseAgentAccount(ids.accountId),
    vaultAccountId: parseAgentAccount(ids.vaultAccountId),
  };
  const res = await fetchImpl(`${origin}/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Could not pair the purse on this machine");
}

/** GET ready → HashPack grant → POST public ids. Never sends a private key. */
export async function letSpendFromReady(opts?: {
  origin?: string;
  fetchImpl?: typeof fetch;
  grant?: (publicKey: string) => Promise<{ accountId: string; vaultAccountId: string }>;
}): Promise<{ accountId: string; vaultAccountId: string }> {
  const origin = opts?.origin ?? "http://127.0.0.1:17879";
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const grant = opts?.grant ?? grantSpendOnChain;
  let ready: Response;
  try {
    ready = await fetchImpl(`${origin}/`, { method: "GET" });
  } catch {
    throw new ReadyNeededError();
  }
  if (!ready.ok) throw new ReadyNeededError();
  const body = (await ready.json().catch(() => ({}))) as { publicKey?: string; privateKey?: unknown };
  if (typeof body.privateKey === "string" && body.privateKey.length > 0) {
    throw new ReadyNeededError();
  }
  if (typeof body.publicKey !== "string" || body.publicKey.length < 16) {
    throw new ReadyNeededError();
  }
  const granted = await grant(body.publicKey);
  try {
    await pairReadyPurse(granted, origin, fetchImpl);
  } catch {
    throw new PairFallbackError(granted);
  }
  return granted;
}

export async function cutSpendOnChain(spenderAccount: string): Promise<void> {
  const spender = parseAgentAccount(spenderAccount);
  const api = await connectHashPack();
  const owner = AccountId.fromString(api.accountId);
  const tx = new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(owner, spender, new Hbar(0))
    .setTransactionId(TransactionId.generate(owner));
  const client = createHederaClient(TESTNET);
  try {
    tx.freezeWith(client);
    const signed = await api.signTransaction(tx);
    await executeWithReceipt(api, signed);
  } catch (err) {
    if (err instanceof WalletRejectedError) throw err;
    if (isReject(err)) throw new WalletRejectedError();
    throw err;
  } finally {
    client.close();
  }
}
