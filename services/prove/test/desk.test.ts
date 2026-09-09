import assert from "node:assert/strict";
import { attachWalletDesk, deskForWallet, deskOwnedByWallet, resolveMintDesk } from "../src/desk.ts";
import { createSessionStore, type GuestSession } from "../src/session.ts";
import type { Address } from "viem";

const A = "0x00000000000000000000000000000000000000aB" as Address;
const B = "0x00000000000000000000000000000000000000cD" as Address;

function sess(over: Partial<GuestSession> & Pick<GuestSession, "id" | "deskId" | "wallet">): GuestSession {
  return {
    state: { version: 1, identities: {}, members: [], mandates: [] },
    evmPrivateKey: "0x",
    createdAt: Date.now(),
    ...over,
  };
}

describe("desk", function () {
  it("resolveMintDesk reuses the wallet desk and ignores a foreign cookie", function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    store.put(sess({ id: "1", deskId: "aa".repeat(16), wallet: A }));
    store.put(sess({ id: "2", deskId: "bb".repeat(16), wallet: B }));
    assert.equal(resolveMintDesk(store, A, "bb".repeat(16)), "aa".repeat(16));
    assert.equal(deskOwnedByWallet(store, "bb".repeat(16), A), false);
  });

  it("attachWalletDesk moves every session for that wallet", function () {
    const store = createSessionStore({ ttlMs: 60_000 });
    store.put(sess({ id: "p", deskId: "aa".repeat(16), wallet: A }));
    store.put(sess({ id: "h", deskId: "zz".repeat(16), wallet: A, parentId: "p" }));
    attachWalletDesk(store, A, "aa".repeat(16));
    assert.equal(store.get("h")?.deskId, "aa".repeat(16));
    assert.equal(deskForWallet(store, A), "aa".repeat(16));
  });
});
