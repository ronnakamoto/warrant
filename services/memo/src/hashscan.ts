export function hashscanTestnetUrl(txId: string): string {
  const dash = txId.replace("@", "-").replace(/\.(?=\d+$)/, "-");
  return `https://hashscan.io/testnet/transaction/${dash}`;
}
