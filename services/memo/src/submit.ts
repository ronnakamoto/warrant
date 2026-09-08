import {
  AccountId,
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";

export type MemoSubmit = (text: string) => Promise<{ txId: string }>;

/** Live HCS submit — message is `{ kind: "memo", text }` only (no names, tree, or wallet). */
export async function submitMemo(text: string): Promise<{ txId: string }> {
  const accountId = process.env.HEDERA_ACCOUNT_ID?.trim();
  const privateKey = process.env.HEDERA_PRIVATE_KEY?.trim();
  const topicId = process.env.HEDERA_MEMO_TOPIC_ID?.trim();
  if (!accountId || !privateKey || !topicId) {
    throw new Error(
      "submitMemo: HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, and HEDERA_MEMO_TOPIC_ID are required",
    );
  }
  const operatorId = AccountId.fromString(accountId);
  const operatorKey = PrivateKey.fromStringECDSA(privateKey);
  const client = Client.forTestnet();
  client.setOperator(operatorId, operatorKey);
  try {
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify({ kind: "memo", text }))
      .freezeWith(client)
      .sign(operatorKey);
    const resp = await tx.execute(client);
    const receipt = await resp.getReceipt(client);
    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`HCS submit status ${receipt.status.toString()}`);
    }
    return { txId: resp.transactionId.toString() };
  } finally {
    client.close();
  }
}
