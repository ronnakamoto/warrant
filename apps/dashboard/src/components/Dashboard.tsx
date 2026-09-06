"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { isAddress, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { hashLeaf } from "../lib/leaf";
import {
  AGENT0_RECENT_QUERY,
  WARRANT_MIRROR_QUERY,
  countAgent0Overlap,
  expectedLeafByWallet,
  rowFromOnchain,
  type Agent0GraphData,
  type WarrantGraphData,
} from "../lib/graph";
import {
  emptyMirror,
  formatMirrorJson,
  loadMirror,
  parseMirrorJson,
  saveMirror,
  type MirrorDoc,
} from "../lib/mirror";
import { friendlyError, rootsMatch, shortRoot, treeStatus } from "../lib/status";
import {
  explorerAddressUrl,
  explorerTxUrl,
  logFromRevoke,
  preflightRevoke,
  readBinding,
  readCurrentRoot,
  revokeOnChain,
  type VerifierLogEntry,
} from "../lib/registry";
import { analyzeMembers, applyRevokeLocal } from "../lib/tree";
import { useThemeMode } from "../theme/ThemeModeProvider";
import { ChainPanel } from "./ChainPanel";
import { MirrorPanel } from "./MirrorPanel";
import { TreePanel } from "./TreePanel";
import { VerifierLogPanel } from "./VerifierLogPanel";

type BusyAction = null | "refresh" | "revoke" | "graph";

export function Dashboard({ embedded = false }: { embedded?: boolean }) {
  const defaultRpc =
    process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org";
  const defaultRegistry =
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ??
    "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89";

  const [rpcUrl, setRpcUrl] = useState(defaultRpc);
  const [registry, setRegistry] = useState(defaultRegistry);
  const [privateKey, setPrivateKey] = useState("");
  const [mirrorJson, setMirrorJson] = useState("");
  const [mirror, setMirror] = useState<MirrorDoc>(emptyMirror);
  const [mirrorHydrated, setMirrorHydrated] = useState(false);
  const [chainRoot, setChainRoot] = useState("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<VerifierLogEntry[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mode, toggle: toggleMode } = useThemeMode();

  const refreshGen = useRef(0);
  const revokeGen = useRef(0);

  useEffect(() => {
    const doc = loadMirror();
    setMirror(doc);
    setMirrorJson(formatMirrorJson(doc));
    setMirrorHydrated(true);
  }, []);

  const members = useMemo(
    () => mirror.members.map((m) => BigInt(m)),
    [mirror.members],
  );
  const analyzed = useMemo(() => analyzeMembers(members), [members]);
  const localRoot = analyzed.root;
  const status = useMemo(
    () => treeStatus(members.length, chainRoot, localRoot.toString()),
    [chainRoot, localRoot, members.length],
  );
  const statusBanner =
    status.kind === "sync"
      ? "success"
      : status.kind === "drift"
        ? "warning"
        : "info";
  const revokeWho =
    mirror.bindings.find((b) => b.label)?.label ??
    (members.length > 0 ? "this root" : null);

  const pushLog = useCallback((entry: VerifierLogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, 40));
  }, []);

  const applyMirrorDoc = useCallback((doc: MirrorDoc) => {
    setMirror(doc);
    saveMirror(doc);
    setMirrorJson(formatMirrorJson(doc));
  }, []);

  const loadFromText = useCallback(
    (raw: string) => {
      setError(null);
      try {
        const doc = parseMirrorJson(raw);
        applyMirrorDoc(doc);
        setChainRoot("");
        const n = doc.members.length;
        const who = doc.bindings.find((b) => b.label)?.label;
        pushLog({
          id: `import-${Date.now()}`,
          at: new Date().toISOString(),
          kind: "loaded",
          message:
            n === 0
              ? "Loaded an empty list"
              : who
                ? `Loaded ${who}’s agents`
                : `Loaded ${n} ${n === 1 ? "agent" : "agents"}`,
        });
      } catch (e) {
        setError(friendlyError(e instanceof Error ? e.message : String(e)));
      }
    },
    [applyMirrorDoc, pushLog],
  );

  const onImportMirror = useCallback(() => {
    loadFromText(mirrorJson);
  }, [loadFromText, mirrorJson]);

  const onLoadGraph = useCallback(async () => {
    setError(null);
    if (!isAddress(registry)) {
      setError(friendlyError("Set a valid MandateRegistry address"));
      return;
    }
    const gen = ++refreshGen.current;
    setBusy("graph");
    try {
      const warrantRes = await fetch("/api/graph", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "warrant", query: WARRANT_MIRROR_QUERY }),
      });
      const warrantJson = (await warrantRes.json()) as {
        data?: WarrantGraphData;
        error?: string;
        errors?: unknown;
      };
      if (!warrantRes.ok || warrantJson.error || warrantJson.errors || !warrantJson.data) {
        throw new Error(
          warrantJson.error ?? JSON.stringify(warrantJson.errors ?? "Graph query failed"),
        );
      }

      let agent0: Agent0GraphData = { agents: [] };
      try {
        const agent0Res = await fetch("/api/graph", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "agent0", query: AGENT0_RECENT_QUERY }),
        });
        const agent0Json = (await agent0Res.json()) as { data?: Agent0GraphData };
        if (agent0Res.ok && agent0Json.data) agent0 = agent0Json.data;
      } catch {
        /* Agent0 is composition, not required to revoke */
      }

      if (gen !== refreshGen.current) return;

      const data = warrantJson.data;
      const expectLeaf = expectedLeafByWallet(data);
      const bindings: MirrorDoc["bindings"] = [];
      const members: string[] = [];
      for (const node of data.bindings ?? []) {
        const wallet = node.wallet.startsWith("0x") ? node.wallet : `0x${node.wallet}`;
        if (!isAddress(wallet)) continue;
        const onchain = await readBinding({
          rpcUrl,
          registry: registry as Address,
          wallet: wallet as Address,
        });
        if (!onchain.exists) continue;
        const leaf = hashLeaf(onchain.pkX, onchain.pkY, BigInt(onchain.tier), BigInt(onchain.epoch));
        const expected = expectLeaf.get(wallet.toLowerCase());
        if (expected && expected !== leaf.toString()) {
          throw new Error(`Graph leaf drifted for ${wallet}`);
        }
        bindings.push(rowFromOnchain(wallet, onchain));
        members.push(leaf.toString());
      }

      applyMirrorDoc({ members, bindings });
      setChainRoot("");
      const overlap = countAgent0Overlap(bindings, agent0.agents ?? []);
      const revokes = data.revokeEvents?.length ?? 0;
      pushLog({
        id: `graph-${Date.now()}`,
        at: new Date().toISOString(),
        kind: "loaded",
        message:
          members.length === 0
            ? "The Graph: no bound roots yet"
            : `The Graph: ${members.length} bound root${members.length === 1 ? "" : "s"}` +
              (overlap ? ` · ${overlap} also on Agent0 (ERC-8004)` : "") +
              (revokes ? ` · ${revokes} revoke event${revokes === 1 ? "" : "s"}` : ""),
      });
      for (const ev of data.revokeEvents ?? []) {
        const tx = ev.txHash.startsWith("0x") ? ev.txHash : `0x${ev.txHash}`;
        pushLog({
          id: ev.id,
          at: new Date(Number(ev.timestamp) * 1000).toISOString(),
          kind: "revoked",
          message: `Indexed revoke · epoch ${ev.epoch}`,
          href: explorerTxUrl(tx as `0x${string}`),
        });
      }
    } catch (e) {
      if (gen !== refreshGen.current) return;
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      if (gen === refreshGen.current) setBusy(null);
    }
  }, [applyMirrorDoc, pushLog, registry, rpcUrl]);

  const onRefreshRoot = useCallback(async () => {
    setError(null);
    if (!isAddress(registry)) {
      setError(friendlyError("Set a valid MandateRegistry address"));
      return;
    }
    const gen = ++refreshGen.current;
    setBusy("refresh");
    try {
      const root = await readCurrentRoot({
        rpcUrl,
        registry: registry as Address,
      });
      if (gen !== refreshGen.current) return;
      setChainRoot(root.toString());
      pushLog({
        id: `root-${Date.now()}`,
        at: new Date().toISOString(),
        kind: "checked",
        message: rootsMatch(root.toString(), localRoot.toString())
          ? `Still live on Base Sepolia (${shortRoot(root.toString())})`
          : `On-chain list differs (${shortRoot(root.toString())})`,
        href: explorerAddressUrl(registry as Address),
      });
    } catch (e) {
      if (gen !== refreshGen.current) return;
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      if (gen === refreshGen.current) setBusy(null);
    }
  }, [localRoot, pushLog, registry, rpcUrl]);

  const runRevoke = useCallback(async () => {
    setConfirmOpen(false);
    setError(null);
    if (!chainRoot) {
      setError("Confirm they’re still live on Base Sepolia before revoking.");
      return;
    }
    if (!isAddress(registry)) {
      setError(friendlyError("Set a valid MandateRegistry address"));
      return;
    }
    if (!privateKey || !isHex(privateKey) || privateKey.length !== 66) {
      setError(friendlyError("Private key must be 0x-prefixed 32-byte hex"));
      return;
    }
    if (members.length === 0) {
      setError("Load who you delegated to first.");
      return;
    }

    const account = privateKeyToAccount(privateKey as Hex);
    const wallet = account.address.toLowerCase();
    const bindingIdx = mirror.bindings.findIndex(
      (b) => b.wallet.toLowerCase() === wallet,
    );
    if (bindingIdx < 0) {
      setError(friendlyError(`No binding in mirror for ${account.address}`));
      return;
    }
    const binding = mirror.bindings[bindingIdx]!;
    const oldLeaf = hashLeaf(
      BigInt(binding.pkX),
      BigInt(binding.pkY),
      BigInt(binding.tier),
      BigInt(binding.epoch),
    );
    const leafIndex = members.findIndex((m) => m === oldLeaf);
    if (leafIndex < 0) {
      setError("This list is out of date. Load a newer copy from your agent app.");
      return;
    }

    const siblings = analyzed.siblingsAt(leafIndex);
    const newEpoch = binding.epoch + 1;
    const newLeaf = hashLeaf(
      BigInt(binding.pkX),
      BigInt(binding.pkY),
      BigInt(binding.tier),
      BigInt(newEpoch),
    );

    const membersSnapshot = [...members];
    const bindingsSnapshot = mirror.bindings.map((b) => ({ ...b }));
    const gen = ++revokeGen.current;
    setBusy("revoke");
    try {
      await preflightRevoke({
        rpcUrl,
        registry: registry as Address,
        wallet: account.address,
        expectedLeaf: oldLeaf,
        localRoot,
      });

      const { root, txHash } = await revokeOnChain({
        rpcUrl,
        registry: registry as Address,
        privateKey: privateKey as Hex,
        siblings,
      });

      if (gen !== revokeGen.current) return;

      const nextMirror = applyRevokeLocal(membersSnapshot, leafIndex, newLeaf);
      const nextBindings = bindingsSnapshot.map((b, i) =>
        i === bindingIdx ? { ...b, epoch: newEpoch } : b,
      );
      applyMirrorDoc({
        members: nextMirror.members.map(String),
        bindings: nextBindings,
      });
      setChainRoot(root.toString());
      setPrivateKey("");

      pushLog(
        logFromRevoke({
          wallet: account.address,
          root,
          txHash,
          epoch: newEpoch,
        }),
      );
    } catch (e) {
      if (gen !== revokeGen.current) return;
      const raw = e instanceof Error ? e.message : String(e);
      setError(friendlyError(raw));
      pushLog({
        id: `err-${Date.now()}`,
        at: new Date().toISOString(),
        kind: "error",
        message: raw,
      });
    } finally {
      if (gen === revokeGen.current) setBusy(null);
    }
  }, [
    analyzed,
    applyMirrorDoc,
    chainRoot,
    localRoot,
    members,
    mirror.bindings,
    privateKey,
    pushLog,
    registry,
    rpcUrl,
  ]);

  const body = (
        <VStack gap={5}>
          {embedded ? null : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--spacing-3)",
            }}
          >
            <VStack gap={1}>
              <Heading level={1}>Warrant</Heading>
              <Text type="supporting" color="secondary">
                Revoke your root. Every agent that proves with it stops.
              </Text>
            </VStack>
            <HStack gap={2} vAlign="center">
              <Text type="supporting" color="secondary">
                Base Sepolia
              </Text>
              <Button
                label={mode === "light" ? "Dark" : "Light"}
                variant="secondary"
                size="sm"
                onClick={toggleMode}
              />
            </HStack>
          </div>
          )}

          {error ? (
            <Banner status="error" title="Can’t do that" description={error} />
          ) : null}
          <Banner
            status={statusBanner}
            title={status.title}
            description={status.detail}
          />

          {!mirrorHydrated ? (
            <Text type="supporting" color="secondary">
              Loading…
            </Text>
          ) : null}

          <TreePanel
            members={members}
            bindings={mirror.bindings}
            privateKey={privateKey}
            busy={busy === "revoke"}
            checkBusy={busy === "refresh"}
            chainChecked={Boolean(chainRoot)}
            onPrivateKey={setPrivateKey}
            onCheckChain={() => void onRefreshRoot()}
            onRequestRevoke={() => setConfirmOpen(true)}
          />

          <MirrorPanel
            mirrorJson={mirrorJson}
            expanded={members.length === 0}
            graphBusy={busy === "graph"}
            onMirrorJson={setMirrorJson}
            onImport={onImportMirror}
            onLoadText={loadFromText}
            onLoadGraph={() => void onLoadGraph()}
          />

          {members.length > 0 ? <Divider /> : null}

          <ChainPanel
            rpcUrl={rpcUrl}
            registry={registry}
            chainRoot={chainRoot}
            localRoot={localRoot.toString()}
            showRoots={members.length > 0}
            onRpcUrl={setRpcUrl}
            onRegistry={setRegistry}
          />

          <VerifierLogPanel log={log} />
        </VStack>
  );

  if (embedded) {
    return (
      <>
        {body}
        {confirmOpen ? (
          <AlertDialog
            isOpen
            onOpenChange={setConfirmOpen}
            title={revokeWho ? `Revoke ${revokeWho}?` : "Revoke this root?"}
            description="Every agent you delegated will be rejected. This cannot be undone."
            cancelLabel="Cancel"
            actionLabel="Revoke"
            actionVariant="destructive"
            isActionLoading={busy === "revoke"}
            onAction={() => void runRevoke()}
          />
        ) : null}
      </>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--color-background-body)",
        color: "var(--color-text-primary)",
        padding: "var(--spacing-6)",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {body}
      </div>
      {confirmOpen ? (
        <AlertDialog
          isOpen
          onOpenChange={setConfirmOpen}
          title={revokeWho ? `Revoke ${revokeWho}?` : "Revoke this root?"}
          description="Every agent you delegated will be rejected. This cannot be undone."
          cancelLabel="Cancel"
          actionLabel="Revoke"
          actionVariant="destructive"
          isActionLoading={busy === "revoke"}
          onAction={() => void runRevoke()}
        />
      ) : null}
    </main>
  );
}
