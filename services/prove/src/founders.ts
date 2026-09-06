/** Founder / operator demo wallet — guests must never share or revoke this. */
export const FOUNDER_ETH = "0xa16d90c5f9D2B14133Db64D57ac81F46DD1161eF" as const;

export function assertNotFounder(wallet: string): void {
  if (wallet.toLowerCase() === FOUNDER_ETH.toLowerCase()) {
    throw new Error("guest wallet must not be the founder binding");
  }
}
