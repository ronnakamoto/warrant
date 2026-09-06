"use client";

import type { HederaWalletSigner } from "./hedera-wallet-pay";
import {
  hederaWalletPay,
  requirementsFromPaymentRequired,
  type PaymentRequiredLike,
} from "./hedera-wallet-pay";

const TESTNET = "hedera:testnet";

export function walletConnectProjectId(): string {
  return process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";
}

export class WalletRejectedError extends Error {
  constructor() {
    super("wallet rejected");
    this.name = "WalletRejectedError";
  }
}

type HashPackSession = {
  accountId: string;
  signTransaction: (tx: unknown) => Promise<unknown>;
  execute: (tx: unknown) => Promise<unknown>;
  accountKey: () => unknown;
};

let session: HashPackSession | null = null;

function isReject(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /reject|denied|user abort|closed|cancel/i.test(msg);
}

function signedTxToBase64(signed: unknown): string {
  if (typeof signed === "string" && signed.length > 0) return signed;
  if (signed && typeof signed === "object") {
    const rec = signed as {
      toBytes?: () => Uint8Array;
      transaction?: string;
      signedTransaction?: string;
    };
    if (typeof rec.transaction === "string") return rec.transaction;
    if (typeof rec.signedTransaction === "string") return rec.signedTransaction;
    if (typeof rec.toBytes === "function") {
      return Buffer.from(rec.toBytes()).toString("base64");
    }
  }
  throw new Error("HashPack did not return a signed transaction");
}

export async function connectHashPack(): Promise<HashPackSession> {
  if (session) return session;
  const projectId = walletConnectProjectId();
  if (!projectId) {
    throw new Error("WalletConnect is not configured");
  }

  try {
    const [{ DAppConnector, HederaChainId, HederaJsonRpcMethod, HederaSessionEvent }, { LedgerId }] =
      await Promise.all([
        import("@hashgraph/hedera-wallet-connect"),
        import("@x402/hedera"),
      ]);

    const connector = new DAppConnector(
      {
        name: "Warrant",
        description: "Let the agent spend",
        url: typeof window !== "undefined" ? window.location.origin : "https://warrant-beta.vercel.app",
        icons: [`${typeof window !== "undefined" ? window.location.origin : "https://warrant-beta.vercel.app"}/icon.png`],
      },
      LedgerId.Testnet,
      projectId,
      Object.values(HederaJsonRpcMethod),
      [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
      [HederaChainId.Testnet],
    );
    await connector.init({ logger: "error" });
    if (!connector.signers?.length) {
      await connector.openModal();
    }
    const signer = connector.signers?.[0];
    if (!signer) throw new WalletRejectedError();
    const accountId = signer.getAccountId().toString();
    session = {
      accountId,
      signTransaction: (tx) => signer.signTransaction(tx),
      execute: (tx) => signer.call(tx),
      accountKey: () => signer.getAccountKey(),
    };
    return session;
  } catch (err) {
    if (err instanceof WalletRejectedError) throw err;
    if (isReject(err)) throw new WalletRejectedError();
    throw err;
  }
}

export function hashpackSigner(api: HashPackSession): HederaWalletSigner {
  return {
    accountId: api.accountId,
    createPartiallySignedTransferTransaction: async (requirements) => {
      const {
        AccountId,
        TransferTransaction,
        TransactionId,
        Hbar,
        TokenId,
        createHederaClient,
      } = await import("@x402/hedera");
      const feePayer = requirements.extra?.feePayer;
      if (typeof feePayer !== "string") {
        throw new Error("feePayer is required in paymentRequirements.extra");
      }
      const amount = BigInt(requirements.amount);
      if (amount <= 0n) throw new Error("amount must be greater than zero");
      const payer = AccountId.fromString(api.accountId);
      const payTo = AccountId.fromString(requirements.payTo);
      const tx = new TransferTransaction();
      const asset = typeof requirements.asset === "string" ? requirements.asset : "0.0.0";
      if (asset === "0.0.0" || asset === "hbar") {
        tx.addHbarTransfer(payer, Hbar.fromTinybars((-amount).toString()));
        tx.addHbarTransfer(payTo, Hbar.fromTinybars(amount.toString()));
      } else {
        const tokenId = TokenId.fromString(asset);
        tx.addTokenTransfer(tokenId, payer, -amount);
        tx.addTokenTransfer(tokenId, payTo, amount);
      }
      tx.setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)));
      const client = createHederaClient(TESTNET);
      try {
        tx.freezeWith(client);
        const signed = await api.signTransaction(tx);
        return signedTxToBase64(signed);
      } catch (err) {
        if (isReject(err)) throw new WalletRejectedError();
        throw err;
      } finally {
        client.close();
      }
    },
  };
}

export async function payWithHashPack(paymentRequired: PaymentRequiredLike): Promise<string> {
  const api = await connectHashPack();
  return hederaWalletPay(hashpackSigner(api), requirementsFromPaymentRequired(paymentRequired));
}
