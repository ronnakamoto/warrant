/** Personhood lookup — off-chain before bindRoot (never checked on-chain). */
export interface IPersonhood {
  /**
   * Anonymous human id for an agent wallet, or `null` if unbound / unknown.
   * Must not throw for unregistered wallets.
   */
  lookupHuman(agentWallet: `0x${string}`): Promise<bigint | null>;
}
