"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import {
  agentPrompt,
  GUEST_COPY,
  PAIR_ORIGIN,
  WARRANT_TTL_MS,
  remainingLife,
  remainingMsUntil,
} from "../lib/guest-copy";

type Phase = "land" | "minting" | "ready" | "revoked" | "limited";
type WarrantView = {
  id: string;
  status: "live" | "fired";
  createdAt: number;
  remainingMs: number;
  expiresAt?: number;
};

function stampExpiry(w: WarrantView, now = Date.now()): WarrantView {
  return { ...w, expiresAt: now + Math.max(0, w.remainingMs) };
}

const wrapRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--spacing-2)",
} as const;

function isLive(w: WarrantView): boolean {
  return w.status === "live" && w.remainingMs > 0;
}

function latestLive(warrants: WarrantView[]): WarrantView | undefined {
  return warrants.filter(isLive).sort((a, b) => b.createdAt - a.createdAt)[0];
}

function idTail(id: string): string {
  return id.length <= 4 ? id : `…${id.slice(-4)}`;
}

export function GuestTry() {
  const [phase, setPhase] = useState<Phase>("land");
  const [warrants, setWarrants] = useState<WarrantView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [origin, setOrigin] = useState("http://127.0.0.1:3001");
  const [agentAccount, setAgentAccount] = useState("");
  const [purseBusy, setPurseBusy] = useState(false);
  const [copiedOnce, setCopiedOnce] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    const saved = window.localStorage.getItem("warrant.purse.account");
    if (saved) setAgentAccount(saved);
  }, []);

  const selected = warrants.find((w) => w.id === selectedId);
  const liveWarrants = warrants.filter(isLive);
  const token = selected && isLive(selected) ? selected.id : null;
  const prompt = token ? agentPrompt(origin, token) : "";
  const localHost = origin.includes("127.0.0.1") || origin.includes("localhost");

  const applyList = useCallback((list: WarrantView[], preferId?: string | null) => {
    setWarrants(list.map((w) => stampExpiry(w)));
    const pick =
      (preferId ? list.find((w) => w.id === preferId && isLive(w)) : undefined) ?? latestLive(list);
    if (pick) {
      setSelectedId(pick.id);
      return pick;
    }
    setSelectedId(null);
    return undefined;
  }, []);

  const refreshWarrants = useCallback(
    async (preferId?: string | null): Promise<WarrantView[]> => {
      const res = await fetch("/api/guest/warrants");
      if (res.status === 401) {
        applyList([]);
        return [];
      }
      if (!res.ok) return [];
      const body = (await res.json().catch(() => ({}))) as {
        warrants?: WarrantView[];
        currentId?: string;
      };
      const list = Array.isArray(body.warrants) ? body.warrants : [];
      applyList(list, preferId ?? body.currentId);
      return list;
    },
    [applyList],
  );

  useEffect(() => {
    void (async () => {
      const list = await refreshWarrants();
      if (latestLive(list)) {
        setPhase("ready");
        return;
      }
      setPhase(list.some((w) => w.status === "fired") ? "revoked" : "land");
    })();
  }, [refreshWarrants]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const now = Date.now();
      setWarrants((prev) =>
        prev.map((w) => ({
          ...w,
          remainingMs:
            typeof w.expiresAt === "number" ? remainingMsUntil(w.expiresAt, now) : w.remainingMs,
        })),
      );
    }, 1_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const current = warrants.find((w) => w.id === selectedId);
    if (current && isLive(current)) return;
    const next = latestLive(warrants);
    if (next) {
      setSelectedId(next.id);
      return;
    }
    setSelectedId(null);
    setNotice(null);
    if (phase === "minting" || phase === "limited" || phase === "revoked") return;
    setPhase("land");
  }, [warrants, selectedId, phase]);

  async function authorize() {
    setError(null);
    setCopied(false);
    setNotice(null);
    let wallet: string;
    try {
      const { connectRootWallet } = await import("../lib/browser-wallet");
      wallet = await connectRootWallet();
    } catch (e) {
      const { WalletRejectedError } = await import("../lib/browser-wallet");
      setError(
        e instanceof WalletRejectedError || (e instanceof Error && e.message === "NO_WALLET")
          ? GUEST_COPY.connectWallet
          : GUEST_COPY.hostError,
      );
      return;
    }
    setPhase("minting");
    const res = await fetch("/api/guest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    if (res.status === 429) {
      setPhase("limited");
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
    if (!res.ok) {
      setError(body.error ?? GUEST_COPY.hostError);
      setPhase(liveWarrants.length > 0 ? "ready" : "land");
      return;
    }
    if (typeof body.token !== "string" || body.token.length === 0) {
      setError(GUEST_COPY.hostError);
      setPhase(liveWarrants.length > 0 ? "ready" : "land");
      return;
    }
    const list = await refreshWarrants(body.token);
    if (!list.some((w) => w.id === body.token)) {
      applyList(
        [
          ...list,
          { id: body.token, status: "live", createdAt: Date.now(), remainingMs: WARRANT_TTL_MS },
        ],
        body.token,
      );
    }
    setPhase("ready");
  }

  async function fireOnChain(sessionId: string, all = false): Promise<boolean> {
    const prep = await fetch("/api/guest/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(all ? { all: true } : { sessionId }),
    });
    const prepBody = (await prep.json().catch(() => ({}))) as {
      error?: string;
      siblings?: string[];
      wallet?: string;
      registry?: string;
      sessionId?: string;
    };
    if (!prep.ok || !prepBody.siblings || !prepBody.wallet || !prepBody.registry) {
      setError(prepBody.error ?? GUEST_COPY.hostError);
      return false;
    }
    const { revokeFromInjected } = await import("../lib/browser-revoke");
    const txHash = await revokeFromInjected({
      siblings: prepBody.siblings,
      wallet: prepBody.wallet as `0x${string}`,
      registry: prepBody.registry as `0x${string}`,
    });
    const confirmId = prepBody.sessionId ?? sessionId;
    const confirm = await fetch("/api/guest/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: confirmId, txHash }),
    });
    if (!confirm.ok) {
      const body = (await confirm.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? GUEST_COPY.hostError);
      return false;
    }
    return true;
  }

  async function fireThis() {
    if (!selectedId) return;
    setError(null);
    setRevoking(true);
    try {
      if (!(await fireOnChain(selectedId))) return;
      const list = await refreshWarrants();
      const remaining = list.filter(isLive);
      setCopied(false);
      if (remaining.length > 0) {
        const next = latestLive(remaining);
        if (next) setSelectedId(next.id);
        setNotice(GUEST_COPY.afterFireThis);
        setPhase("ready");
        return;
      }
      setNotice(null);
      setSelectedId(null);
      setPhase("revoked");
    } catch (e) {
      const { WalletRejectedError } = await import("../lib/browser-wallet");
      if (e instanceof WalletRejectedError) {
        setError(GUEST_COPY.signRejected);
        return;
      }
      setError(e instanceof Error ? e.message : GUEST_COPY.hostError);
    } finally {
      setRevoking(false);
    }
  }

  async function fireEvery() {
    if (liveWarrants.length <= 1) return;
    setError(null);
    setRevoking(true);
    try {
      if (!(await fireOnChain(liveWarrants[0]!.id, true))) return;
      const list = await refreshWarrants();
      const remaining = list.filter(isLive);
      setCopied(false);
      if (remaining.length > 0) {
        const next = latestLive(remaining);
        if (next) setSelectedId(next.id);
        setPhase("ready");
        return;
      }
      setNotice(null);
      setSelectedId(null);
      setPhase("revoked");
    } catch (e) {
      const { WalletRejectedError } = await import("../lib/browser-wallet");
      if (e instanceof WalletRejectedError) {
        setError(GUEST_COPY.signRejected);
        return;
      }
      setError(e instanceof Error ? e.message : GUEST_COPY.hostError);
    } finally {
      setRevoking(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setCopiedOnce(true);
    } catch {
      setError(GUEST_COPY.hostError);
    }
  }

  async function letSpend() {
    setError(null);
    setPurseBusy(true);
    try {
      const { letSpendFromReady } = await import("../lib/hedera-purse");
      const granted = await letSpendFromReady({ origin: PAIR_ORIGIN });
      setAgentAccount(granted.accountId);
      window.localStorage.setItem("warrant.purse.account", granted.accountId);
      setNotice(GUEST_COPY.spendGranted);
    } catch (e) {
      const { ReadyNeededError, PairFallbackError } = await import("../lib/hedera-purse");
      if (e instanceof ReadyNeededError) {
        setError(GUEST_COPY.readyNeeded);
        return;
      }
      if (e instanceof PairFallbackError) {
        setAgentAccount(e.accountId);
        window.localStorage.setItem("warrant.purse.account", e.accountId);
        setNotice(
          `${GUEST_COPY.pairFallback} --account ${e.accountId} --vault ${e.vaultAccountId}`,
        );
        return;
      }
      const { WalletRejectedError } = await import("../lib/hedera-hashpack");
      if (e instanceof WalletRejectedError) {
        setError(GUEST_COPY.walletRejected);
        return;
      }
      setError(e instanceof Error ? e.message : GUEST_COPY.hostError);
    } finally {
      setPurseBusy(false);
    }
  }

  async function cutSpend() {
    setError(null);
    setPurseBusy(true);
    try {
      const { cutSpendOnChain } = await import("../lib/hedera-purse");
      await cutSpendOnChain(agentAccount);
      setNotice(GUEST_COPY.spendCut);
    } catch (e) {
      const { WalletRejectedError } = await import("../lib/hedera-hashpack");
      if (e instanceof WalletRejectedError) {
        setError(GUEST_COPY.walletRejected);
        return;
      }
      setError(e instanceof Error ? e.message : GUEST_COPY.hostError);
    } finally {
      setPurseBusy(false);
    }
  }

  const busy = phase === "minting" || revoking || purseBusy;
  const live = token !== null && phase !== "land" && phase !== "limited" && phase !== "revoked";

  return (
    <VStack gap={5}>
      <VStack gap={2}>
        <Heading level={1}>{GUEST_COPY.headline}</Heading>
        <Text type="supporting" color="secondary">
          {GUEST_COPY.standfirst}
        </Text>
        <Text type="supporting" color="secondary">
          {GUEST_COPY.world}
        </Text>
        <Text type="supporting" color="secondary">
          {GUEST_COPY.twoWallets}
        </Text>
      </VStack>

      {error ? <Banner status="error" title="Can’t do that" description={error} /> : null}

      {phase === "land" || phase === "limited" ? (
        <VStack gap={3}>
          {phase === "limited" ? <Banner status="warning" title={GUEST_COPY.rateLimited} /> : null}
          <Text type="supporting" color="secondary">
            {GUEST_COPY.connectWallet}
          </Text>
          <Button label={GUEST_COPY.authorize} onClick={() => void authorize()} isDisabled={busy} />
        </VStack>
      ) : null}

      {phase === "minting" ? <Text>{GUEST_COPY.minting}</Text> : null}

      {live ? (
        <VStack gap={5}>
          {notice ? <Banner status="success" title={notice} /> : null}
          <VStack gap={1}>
            <Text>{GUEST_COPY.authorized}</Text>
            {selected ? (
              <Text type="supporting" color="secondary">
                {remainingLife(selected.remainingMs)}
              </Text>
            ) : null}
          </VStack>
          {liveWarrants.length > 1 ? (
            <div style={wrapRow}>
              {liveWarrants.map((w) => (
                <Button
                  key={w.id}
                  size="sm"
                  variant={w.id === selectedId ? "primary" : "secondary"}
                  label={idTail(w.id)}
                  isDisabled={busy}
                  onClick={() => {
                    setSelectedId(w.id);
                    setCopied(false);
                  }}
                />
              ))}
            </div>
          ) : null}

          <VStack gap={2}>
            <Text type="supporting" color="secondary">
              {GUEST_COPY.botLead}
            </Text>
            {localHost ? (
              <Text type="supporting" color="secondary">
                {GUEST_COPY.localhostHint}
              </Text>
            ) : null}
            <div style={wrapRow}>
              <Button
                label={copied ? GUEST_COPY.copied : GUEST_COPY.copyPrompt}
                variant="secondary"
                onClick={() => void copyPrompt()}
              />
              <Button
                label={liveWarrants.length > 1 ? GUEST_COPY.fireThis : GUEST_COPY.fireOne}
                variant="destructive"
                onClick={() => void fireThis()}
                isDisabled={busy}
              />
            </div>
            {liveWarrants.length > 1 ? (
              <Button
                label={GUEST_COPY.fireEvery}
                variant="destructive"
                onClick={() => void fireEvery()}
                isDisabled={busy}
              />
            ) : null}
          </VStack>

          {copiedOnce ? (
            <VStack gap={2}>
              <div style={wrapRow}>
                <Button
                  label={purseBusy ? GUEST_COPY.spending : GUEST_COPY.letSpend}
                  variant="secondary"
                  onClick={() => void letSpend()}
                  isDisabled={busy}
                />
                <Button
                  label={GUEST_COPY.cutSpend}
                  variant="secondary"
                  onClick={() => void cutSpend()}
                  isDisabled={busy || agentAccount.trim() === ""}
                />
              </div>
            </VStack>
          ) : null}
        </VStack>
      ) : null}

      {phase === "revoked" ? (
        <VStack gap={3}>
          <Banner status="success" title={GUEST_COPY.afterRevoke} />
          <Button label={GUEST_COPY.again} onClick={() => void authorize()} isDisabled={busy} />
        </VStack>
      ) : null}
    </VStack>
  );
}
