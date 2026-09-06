"use client";

import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { agentPrompt, GUEST_COPY } from "../lib/guest-copy";

type Phase = "land" | "minting" | "ready" | "calling" | "done" | "revoked" | "quota" | "limited";

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

export function GuestTry() {
  const [phase, setPhase] = useState<Phase>("land");
  const [text, setText] = useState("Good morning.");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nullifier, setNullifier] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [origin, setOrigin] = useState("http://127.0.0.1:3001");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const prompt = token ? agentPrompt(origin, token) : "";
  const localHost = origin.includes("127.0.0.1") || origin.includes("localhost");

  async function authorize() {
    setError(null);
    setCopied(false);
    setPhase("minting");
    const res = await fetch("/api/guest", { method: "POST" });
    if (res.status === 429) {
      setPhase("limited");
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
    if (!res.ok) {
      setError(body.error ?? GUEST_COPY.hostError);
      setPhase("land");
      return;
    }
    if (typeof body.token !== "string" || body.token.length === 0) {
      setError(GUEST_COPY.hostError);
      setPhase("land");
      return;
    }
    setToken(body.token);
    setPhase("ready");
  }

  async function callShop() {
    setError(null);
    setResult(null);
    setPhase("calling");
    const res = await fetch("/api/guest/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, source: "en", target: "es" }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      text?: string;
      error?: string;
      nullifier?: string;
    };
    if (res.status === 402) {
      setPhase("quota");
      return;
    }
    if (res.status === 403) {
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
    setPhase("done");
  }

  async function fireEveryone() {
    setError(null);
    const res = await fetch("/api/guest/revoke", { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? GUEST_COPY.hostError);
      return;
    }
    const denied = await fetch("/api/guest/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, source: "en", target: "es" }),
    });
    if (denied.status === 200) {
      setError(GUEST_COPY.revokeFailed);
      setPhase("done");
      return;
    }
    setPhase("revoked");
    setResult(null);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setError(GUEST_COPY.hostError);
    }
  }

  const busy = phase === "minting" || phase === "calling";
  const live = phase === "ready" || phase === "calling" || phase === "done";

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
      {phase === "calling" ? <Text>{GUEST_COPY.proving}</Text> : null}

      {live ? (
        <VStack gap={4}>
          <VStack gap={2}>
            <Text>{GUEST_COPY.authorized}</Text>
            <Text type="supporting" color="secondary">
              {GUEST_COPY.promptLead}
            </Text>
            {localHost ? (
              <Text type="supporting" color="secondary">
                {GUEST_COPY.localhostHint}
              </Text>
            ) : null}
            <pre
              style={{
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontFamily: "var(--font-family-mono)",
                fontSize: "var(--font-size-supporting)",
                margin: 0,
                padding: "var(--spacing-3)",
                background: "var(--color-background-input)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {prompt}
            </pre>
            <HStack gap={2}>
              <Button
                label={copied ? GUEST_COPY.copied : GUEST_COPY.copyPrompt}
                variant="secondary"
                onClick={() => void copyPrompt()}
              />
              <Button
                label={GUEST_COPY.revoke}
                variant="secondary"
                onClick={() => void fireEveryone()}
                isDisabled={busy}
              />
            </HStack>
          </VStack>

          <VStack gap={2}>
            <Text type="supporting" color="secondary">
              {GUEST_COPY.shopLead}
            </Text>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={3}
              aria-label={GUEST_COPY.shopLabel}
              style={fieldStyle}
            />
            <Button
              label={GUEST_COPY.shopCall}
              onClick={() => void callShop()}
              isDisabled={busy || text.trim() === ""}
            />
          </VStack>
        </VStack>
      ) : null}

      {phase === "done" && result !== null ? (
        <VStack gap={2}>
          <Text>{result}</Text>
          <Text type="supporting" color="secondary">
            {GUEST_COPY.successFoot}
          </Text>
          {nullifier ? (
            <Text type="supporting" color="secondary">
              {nullifier.length > 16 ? `${nullifier.slice(0, 10)}…${nullifier.slice(-6)}` : nullifier}
            </Text>
          ) : null}
        </VStack>
      ) : null}

      {phase === "quota" ? <Banner status="info" title={GUEST_COPY.quota} /> : null}

      {phase === "revoked" ? (
        <VStack gap={3}>
          <Banner status="success" title={GUEST_COPY.afterRevoke} />
          <Button
            label={GUEST_COPY.again}
            onClick={() => {
              setPhase("land");
              setResult(null);
              setNullifier(null);
              setError(null);
              setCopied(false);
              setToken(null);
            }}
          />
        </VStack>
      ) : null}
    </VStack>
  );
}
