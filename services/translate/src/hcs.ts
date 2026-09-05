/** Audit sink after successful authorize — no authorization logic. */
export type AuditEvent = {
  nullifier: string;
  scope: string;
  tier: string;
  txId?: string;
};

export type HcsSink = {
  submit(event: AuditEvent): Promise<void>;
};

/** Logs nullifier-only audit line (no names/addresses/tree). */
export function createLogHcsSink(): HcsSink {
  return {
    async submit(event) {
      console.log(
        JSON.stringify({
          audit: "warrant",
          nullifier: event.nullifier,
          scope: event.scope,
          tier: event.tier,
          txId: event.txId ?? null,
        }),
      );
    },
  };
}
