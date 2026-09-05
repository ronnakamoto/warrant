import {
  Client,
  AccountId,
  PrivateKey,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";
import type { AuditEvent, HcsSink } from "./hcs.js";
import { createLogHcsSink } from "./hcs.js";

export type HederaHcsConfig = {
  accountId: string;
  privateKey: string;
  topicId: string;
  /** Also log locally (nullifier-only). Default true. */
  alsoLog?: boolean;
};

/**
 * Live HCS submit — audit payload is nullifier/scope/tier only (no names/tree).
 */
export function createHederaHcsSink(config: HederaHcsConfig): HcsSink {
  const log = config.alsoLog === false ? null : createLogHcsSink();
  return {
    async submit(event: AuditEvent) {
      await log?.submit(event);
      const operatorId = AccountId.fromString(config.accountId);
      const operatorKey = PrivateKey.fromStringECDSA(config.privateKey);
      const client = Client.forTestnet();
      client.setOperator(operatorId, operatorKey);
      try {
        const payload = JSON.stringify({
          nullifier: event.nullifier,
          scope: event.scope,
          tier: event.tier,
          ...(event.txId ? { txId: event.txId } : {}),
        });
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(config.topicId)
          .setMessage(payload)
          .freezeWith(client)
          .sign(operatorKey);
        const resp = await tx.execute(client);
        const receipt = await resp.getReceipt(client);
        if (receipt.status.toString() !== "SUCCESS") {
          throw new Error(`HCS submit status ${receipt.status.toString()}`);
        }
      } finally {
        client.close();
      }
    },
  };
}

/** Prefer live HCS when keys present; otherwise log-only. */
export function createHcsSinkFromEnv(env: NodeJS.ProcessEnv = process.env): HcsSink {
  const accountId = env.HEDERA_ACCOUNT_ID;
  const privateKey = env.HEDERA_PRIVATE_KEY;
  const topicId = env.HEDERA_TOPIC_ID;
  if (accountId && privateKey && topicId) {
    return createHederaHcsSink({ accountId, privateKey, topicId });
  }
  return createLogHcsSink();
}
