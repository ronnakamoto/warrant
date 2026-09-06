"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import {
  agentPrompt,
  GUEST_COPY,
  HEDERA_FAUCET,
  hashscanTestnetUrl,
  remainingLife,
  remainingMsUntil,
  shopIsDead,
} from "../lib/guest-copy";

type Phase = "land" | "minting" | "ready" | "calling" | "done" | "revoked" | "quota" | "limited";
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

const fieldStyle = {
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  minWidth: 0,
  padding: "var(--spacing-3)",
  fontFamily: "var(--font-family-sans)",
  fontSize: "var(--font-size-body)",
  background: "var(--color-background-input)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-subtle)",
  borderRadius: "var(--radius-sm)",
  resize: "vertical",
  overflowWrap: "anywhere",
} as const;

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

async function confirmShopDead(text: string): Promise<boolean> {
  const denied = await fetch("/api/guest/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, source: "en", target: "es" }),
  });
  return shopIsDead(denied.status);
}

export function GuestTry() {
  const [phase, setPhase] = useState<Phase>("land");
  const [warrants, setWarrants] = useState<WarrantView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cookieSessionId, setCookieSessionId] = useState<string | null>(null);
  const [text, setText] = useState("Good morning.");
  const [hederaAccount, setHederaAccount] = useState("");
  const [hederaKey, setHederaKey] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nullifier, setNullifier] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [origin, setOrigin] = useState("http://127.0.0.1:3001");

  useEffect(() => {
    setOrigin(window.location.origin);
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
        setCookieSessionId(null);
        applyList([]);
        return [];
      }
      if (!res.ok) return [];
      const body = (await res.json().catch(() => ({}))) as {
        warrants?: WarrantView[];
        currentId?: string;
      };
      const list = Array.isArray(body.warrants) ? body.warrants : [];
      if (typeof body.currentId === "string") setCookieSessionId(body.currentId);
      applyList(list, preferId);
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
    setResult(null);
    setNullifier(null);
    setTxId(null);
    setNotice(null);
    if (phase === "minting" || phase === "limited" || phase === "revoked") return;
    setPhase("land");
  }, [warrants, selectedId, phase]);

  async function authorize() {
    setError(null);
    setCopied(false);
    setNotice(null);
    setResult(null);
    setNullifier(null);
    setTxId(null);
    setPhase("minting");
    const res = await fetch("/api/guest", { method: "POST" });
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
    setCookieSessionId(body.token);
    const list = await refreshWarrants(body.token);
    if (!list.some((w) => w.id === body.token)) {
      applyList(
        [
          ...list,
          { id: body.token, status: "live", createdAt: Date.now(), remainingMs: 1_800_000 },
        ],
        body.token,
      );
    }
    setPhase("ready");
  }

  async function callShop() {
    setError(null);
    setResult(null);
    setPhase("calling");
    const account = hederaAccount.trim();
    const key = hederaKey.trim();
    const res = await fetch("/api/guest/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        source: "en",
        target: "es",
        ...(account && key ? { hederaAccountId: account, hederaPrivateKey: key } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      text?: string;
      error?: string;
      nullifier?: string;
      txId?: string;
    };
    if (res.status === 402) {
      setPhase("quota");
      return;
    }
    if (res.status === 403) {
      const list = await refreshWarrants();
      setResult(null);
      setNullifier(null);
      setTxId(null);
      if (latestLive(list)) {
        setPhase("ready");
        return;
      }
      setPhase("revoked");
      return;
    }
    if (!res.ok) {
      setError(body.error ?? GUEST_COPY.hostError);
      setPhase("ready");
      return;
    }
    setResult(typeof body.text === "string" ? body.text : "");
    setNullifier(typeof body.nullifier === "string" ? body.nullifier : null);
    setTxId(typeof body.txId === "string" && body.txId.length > 0 ? body.txId : null);
    setPhase("done");
  }

  async function fireThis() {
    if (!selectedId) return;
    setError(null);
    setRevoking(true);
    try {
      const res = await fetch("/api/guest/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: selectedId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? GUEST_COPY.hostError);
        return;
      }
      if (cookieSessionId === selectedId) {
        const dead = await confirmShopDead(text);
        if (!dead) {
          setError(GUEST_COPY.revokeFailed);
          setPhase("done");
          return;
        }
      }
      const list = await refreshWarrants();
      const remaining = list.filter(isLive);
      setResult(null);
      setNullifier(null);
      setTxId(null);
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
    } finally {
      setRevoking(false);
    }
  }

  async function fireEvery() {
    if (liveWarrants.length <= 1) return;
    setError(null);
    setRevoking(true);
    try {
      const res = await fetch("/api/guest/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; failed?: number };
      if (!res.ok) {
        setError(body.error ?? GUEST_COPY.hostError);
        return;
      }
      const list = await refreshWarrants();
      const remaining = list.filter(isLive);
      setResult(null);
      setNullifier(null);
      setTxId(null);
      setCopied(false);
      if (remaining.length > 0) {
        if (typeof body.failed === "number" && body.failed > 0) {
          setError(GUEST_COPY.revokeFailed);
        }
        const next = latestLive(remaining);
        if (next) setSelectedId(next.id);
        setPhase("ready");
        return;
      }
      const dead = await confirmShopDead(text);
      if (!dead) {
        setError(GUEST_COPY.revokeFailed);
        setPhase("done");
        return;
      }
      setNotice(null);
      setSelectedId(null);
      setPhase("revoked");
    } finally {
      setRevoking(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setError(GUEST_COPY.hostError);
    }
  }

  const busy = phase === "minting" || phase === "calling" || revoking;
  const live =
    token !== null && phase !== "land" && phase !== "limited" && phase !== "revoked";
  const canShop = selectedId === cookieSessionId && cookieSessionId;
  const heardBack = phase === "done" && result !== null;
  const wantsPay =
    phase === "quota" || hederaAccount.trim().length > 0 || hederaKey.trim().length > 0;
  const canPay = hederaAccount.trim().length > 0 && hederaKey.trim().length > 0;

  function sendAnother() {
    setResult(null);
    setNullifier(null);
    setTxId(null);
    setError(null);
    setPhase(canPay ? "quota" : "ready");
  }

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
      </VStack>

      {error ? <Banner status="error" title="Can’t do that" description={error} /> : null}

      {phase === "land" || phase === "limited" ? (
        <VStack gap={3}>
          {phase === "limited" ? (
            <Banner status="warning" title={GUEST_COPY.rateLimited} />
          ) : null}
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
                    setResult(null);
                    setNullifier(null);
                    setTxId(null);
                  }}
                />
              ))}
            </div>
          ) : null}

          {canShop && heardBack ? (
            <VStack gap={3}>
              <Heading level={2}>{result}</Heading>
              <Text type="supporting" color="secondary">
                {txId ? GUEST_COPY.paidFoot : GUEST_COPY.successFoot}
              </Text>
              {txId ? (
                <Text type="supporting">
                  <a href={hashscanTestnetUrl(txId)} target="_blank" rel="noreferrer">
                    {GUEST_COPY.paidLink}
                  </a>
                </Text>
              ) : null}
              <Button
                label={liveWarrants.length > 1 ? GUEST_COPY.fireThis : GUEST_COPY.fireOne}
                variant="destructive"
                onClick={() => void fireThis()}
                isDisabled={busy}
              />
              {liveWarrants.length > 1 ? (
                <Button
                  label={GUEST_COPY.fireEvery}
                  variant="destructive"
                  onClick={() => void fireEvery()}
                  isDisabled={busy}
                />
              ) : null}
              <Button
                label={GUEST_COPY.sendAnother}
                variant="secondary"
                onClick={sendAnother}
                isDisabled={busy}
              />
            </VStack>
          ) : null}

          {canShop && !heardBack ? (
            <VStack gap={3}>
              <Text type="supporting" color="secondary">
                {GUEST_COPY.shopLead}
              </Text>
              {phase === "quota" ? <Banner status="info" title={GUEST_COPY.quota} /> : null}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
                rows={3}
                aria-label={GUEST_COPY.shopLabel}
                style={fieldStyle}
              />
              {phase === "calling" ? <Text>{GUEST_COPY.proving}</Text> : null}
              {wantsPay ? (
                <VStack gap={2}>
                  <Text type="supporting" color="secondary">
                    {GUEST_COPY.faucetLead}{" "}
                    <a href={HEDERA_FAUCET} target="_blank" rel="noreferrer">
                      {GUEST_COPY.faucetLink}
                    </a>
                  </Text>
                  <input
                    type="text"
                    value={hederaAccount}
                    onChange={(e) => setHederaAccount(e.target.value)}
                    disabled={busy}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={GUEST_COPY.payAccount}
                    placeholder={GUEST_COPY.payAccount}
                    style={fieldStyle}
                  />
                  <input
                    type="password"
                    value={hederaKey}
                    onChange={(e) => setHederaKey(e.target.value)}
                    disabled={busy}
                    autoComplete="off"
                    aria-label={GUEST_COPY.payKey}
                    placeholder={GUEST_COPY.payKey}
                    style={fieldStyle}
                  />
                  <Text type="supporting" color="secondary">
                    {GUEST_COPY.payHint}
                  </Text>
                </VStack>
              ) : null}
              <Button
                label={canPay ? GUEST_COPY.payCall : GUEST_COPY.shopCall}
                onClick={() => void callShop()}
                isDisabled={busy || text.trim() === ""}
              />
            </VStack>
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
              {!heardBack ? (
                <Button
                  label={liveWarrants.length > 1 ? GUEST_COPY.fireThis : GUEST_COPY.fireOne}
                  variant="destructive"
                  onClick={() => void fireThis()}
                  isDisabled={busy}
                />
              ) : null}
            </div>
            {!heardBack && liveWarrants.length > 1 ? (
              <Button
                label={GUEST_COPY.fireEvery}
                variant="destructive"
                onClick={() => void fireEvery()}
                isDisabled={busy}
              />
            ) : null}
          </VStack>
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
