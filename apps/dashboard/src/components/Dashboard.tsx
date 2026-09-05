"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { isAddress, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { hashLeaf } from "../lib/leaf";
import {
  emptyMirror,
  formatMirrorJson,
  loadMirror,
  parseMirrorJson,
  saveMirror,
  type MirrorDoc,
} from "../lib/mirror";
import {
  explorerAddressUrl,
  logFromRevoke,
  preflightRevoke,
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

type BusyAction = null | "refresh" | "revoke";

export function Dashboard() {
  const defaultRpc =
    process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org";
  const defaultRegistry = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? "";

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

  const pushLog = useCallback((entry: VerifierLogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, 40));
  }, []);

  const applyMirrorDoc = useCallback((doc: MirrorDoc) => {
    setMirror(doc);
    saveMirror(doc);
    setMirrorJson(formatMirrorJson(doc));
  }, []);

  const onImportMirror = useCallback(() => {
    setError(null);
    try {
      const doc = parseMirrorJson(mirrorJson);
      applyMirrorDoc(doc);
      pushLog({
        id: `import-${Date.now()}`,
        at: new Date().toISOString(),
        kind: "info",
        message: `Imported mirror (${doc.members.length} leaves)`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [applyMirrorDoc, mirrorJson, pushLog]);

  const onRefreshRoot = useCallback(async () => {
    setError(null);
    if (!isAddress(registry)) {
      setError("Set a valid MandateRegistry address");
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
        kind: "info",
        message: `On-chain currentRoot ${root.toString()}`,
        href: explorerAddressUrl(registry as Address),
      });
    } catch (e) {
      if (gen !== refreshGen.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === refreshGen.current) setBusy(null);
    }
  }, [pushLog, registry, rpcUrl]);

  const runRevoke = useCallback(async () => {
    setConfirmOpen(false);
    setError(null);
    if (!isAddress(registry)) {
      setError("Set a valid MandateRegistry address");
      return;
    }
    if (!privateKey || !isHex(privateKey) || privateKey.length !== 66) {
      setError(
        "Private key must be 0x-prefixed 32-byte hex (demo only — never commit)",
      );
      return;
    }
    if (members.length === 0) {
      setError("Import a local tree mirror (members[]) before revoke");
      return;
    }

    const account = privateKeyToAccount(privateKey as Hex);
    const wallet = account.address.toLowerCase();
    const bindingIdx = mirror.bindings.findIndex(
      (b) => b.wallet.toLowerCase() === wallet,
    );
    if (bindingIdx < 0) {
      setError(`No binding in mirror for ${account.address}`);
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
      setError("Current leaf missing from members[] — mirror out of sync");
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
      pushLog({
        id: `policy-${Date.now()}`,
        at: new Date().toISOString(),
        kind: "info",
        message:
          "Next warrant.fetch with the old merkleRoot must get 403 root_revoked (CurrentRootChecker).",
      });
    } catch (e) {
      if (gen !== revokeGen.current) return;
      setError(e instanceof Error ? e.message : String(e));
      pushLog({
        id: `err-${Date.now()}`,
        at: new Date().toISOString(),
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      if (gen === revokeGen.current) setBusy(null);
    }
  }, [
    analyzed,
    applyMirrorDoc,
    localRoot,
    members,
    mirror.bindings,
    privateKey,
    pushLog,
    registry,
    rpcUrl,
  ]);

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
        <VStack gap={5}>
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
                Mandate tree · revoke · verifier log — Carbon g10 / g100 on Astryx
              </Text>
            </VStack>
            <HStack gap={2} vAlign="center">
              <Badge
                variant="info"
                label={mode === "light" ? "g10" : "g100"}
              />
              <Button
                label={mode === "light" ? "Switch to g100" : "Switch to g10"}
                variant="secondary"
                size="sm"
                onClick={toggleMode}
              />
            </HStack>
          </div>

          {error ? (
            <Banner status="error" title="Action failed" description={error} />
          ) : null}

          {!mirrorHydrated ? (
            <Text type="supporting" color="secondary">
              Loading local mirror…
            </Text>
          ) : null}

          <ChainPanel
            rpcUrl={rpcUrl}
            registry={registry}
            privateKey={privateKey}
            chainRoot={chainRoot}
            localRoot={localRoot.toString()}
            busy={busy === "refresh"}
            onRpcUrl={setRpcUrl}
            onRegistry={setRegistry}
            onPrivateKey={setPrivateKey}
            onRefresh={() => void onRefreshRoot()}
          />

          <Divider />

          <MirrorPanel
            mirrorJson={mirrorJson}
            onMirrorJson={setMirrorJson}
            onImport={onImportMirror}
          />

          <TreePanel
            members={members}
            bindings={mirror.bindings}
            busy={busy === "revoke"}
            onRequestRevoke={() => setConfirmOpen(true)}
          />

          <Divider />

          <VerifierLogPanel log={log} />
        </VStack>
      </div>

      <AlertDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Revoke root leaf?"
        description="This bumps your on-chain epoch and changes currentRoot. Agents proving against the old root will get 403 root_revoked. This cannot be undone."
        cancelLabel="Cancel"
        actionLabel="Revoke"
        actionVariant="destructive"
        isActionLoading={busy === "revoke"}
        onAction={() => void runRevoke()}
      />
    </main>
  );
}
