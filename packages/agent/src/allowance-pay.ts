import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import {
  AccountId,
  ExactHederaScheme,
  Hbar,
  TransactionId,
  TransferTransaction,
  createHederaClient,
  type ClientHederaSigner,
} from "@x402/hedera";
import { parsePursePrivateKey, type Purse } from "./purse.js";

const TESTNET = "hedera:testnet";

/** Agent is fee payer. Funds come from the vault via an approved HBAR transfer. */
export function createAllowanceSigner(purse: {
  accountId: string;
  vaultAccountId: string;
  privateKey: string;
}): ClientHederaSigner {
  const spender = AccountId.fromString(purse.accountId);
  const vault = AccountId.fromString(purse.vaultAccountId);
  const key = parsePursePrivateKey(purse.privateKey);
  return {
    accountId: spender.toString(),
    createPartiallySignedTransferTransaction: async (requirements) => {
      const amount = BigInt(requirements.amount);
      if (amount <= 0n) throw new Error("amount must be greater than zero");
      const payTo = AccountId.fromString(requirements.payTo);
      const tx = new TransferTransaction()
        .addApprovedHbarTransfer(vault, Hbar.fromTinybars((-amount).toString()))
        .addApprovedHbarTransfer(payTo, Hbar.fromTinybars(amount.toString()))
        .setTransactionId(TransactionId.generate(spender));
      const client = createHederaClient(TESTNET);
      try {
        tx.freezeWith(client);
        const signed = await tx.sign(key);
        return Buffer.from(signed.toBytes()).toString("base64");
      } finally {
        client.close();
      }
    },
  };
}

export function allowancePaymentFetch(purse: Purse): typeof fetch {
  if (!purse.accountId || !purse.vaultAccountId) {
    throw new Error("purse is not bound");
  }
  const signer = createAllowanceSigner({
    accountId: purse.accountId,
    vaultAccountId: purse.vaultAccountId,
    privateKey: purse.privateKey,
  });
  const client = x402Client.fromConfig({
    schemes: [{ network: "hedera:*", client: new ExactHederaScheme(signer) }],
    spendControls: false,
  });
  return wrapFetchWithPayment(globalThis.fetch, client);
}
