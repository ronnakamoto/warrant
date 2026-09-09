import type { Address } from "viem";
import { createDeskId, type SessionStore } from "./session.js";

const DESK_ID_RE = /^[0-9a-f]{32}$/;

export function deskForWallet(store: SessionStore, wallet: Address): string | undefined {
  const want = wallet.toLowerCase();
  for (const session of store.dump()) {
    if (session.wallet.toLowerCase() === want) return session.deskId;
  }
  return undefined;
}

export function deskOwnedByWallet(store: SessionStore, deskId: string, wallet: Address): boolean {
  const want = wallet.toLowerCase();
  for (const session of store.dump()) {
    if (session.deskId !== deskId) continue;
    if (session.wallet.toLowerCase() !== want) return false;
  }
  return true;
}

export function attachWalletDesk(store: SessionStore, wallet: Address, deskId: string): void {
  const want = wallet.toLowerCase();
  for (const session of store.dump()) {
    if (session.wallet.toLowerCase() !== want) continue;
    session.deskId = deskId;
    store.put(session);
  }
}

export function resolveMintDesk(
  store: SessionStore,
  wallet: Address,
  cookieDesk?: string,
): string {
  const existing = deskForWallet(store, wallet);
  if (existing) {
    attachWalletDesk(store, wallet, existing);
    return existing;
  }
  if (cookieDesk && DESK_ID_RE.test(cookieDesk) && deskOwnedByWallet(store, cookieDesk, wallet)) {
    return cookieDesk;
  }
  return createDeskId();
}
