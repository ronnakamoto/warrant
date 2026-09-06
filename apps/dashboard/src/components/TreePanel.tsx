"use client";

import { useMemo } from "react";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TreeList } from "@astryxdesign/core/TreeList";
import { hashLeaf } from "../lib/leaf";
import type { BindingRow } from "../lib/mirror";
import { analyzeMembers } from "../lib/tree";
import { shortRoot, shortWallet } from "../lib/status";

export type TreePanelProps = {
  members: readonly bigint[];
  bindings: readonly BindingRow[];
  privateKey: string;
  busy: boolean;
  checkBusy: boolean;
  chainChecked: boolean;
  onPrivateKey: (v: string) => void;
  onCheckChain: () => void;
  onRequestRevoke: () => void;
};

export function TreePanel(props: TreePanelProps) {
  const analyzed = useMemo(
    () => analyzeMembers(props.members),
    [props.members],
  );

  const bindingByLeaf = useMemo(() => {
    const map = new Map<string, BindingRow>();
    for (const b of props.bindings) {
      try {
        const leaf = hashLeaf(
          BigInt(b.pkX),
          BigInt(b.pkY),
          BigInt(b.tier),
          BigInt(b.epoch),
        );
        map.set(leaf.toString(), b);
      } catch {
        // skip malformed binding rows
      }
    }
    return map;
  }, [props.bindings]);

  const primary = props.bindings[0];
  const who = primary?.label ?? (primary ? shortWallet(primary.wallet) : null);

  const items = useMemo(
    () => [
      {
        id: "root",
        label:
          analyzed.root === 0n
            ? "No members"
            : `Root ${shortRoot(analyzed.root.toString())}`,
        isExpanded: true,
        children: props.members.map((leaf, i) => {
          const binding = bindingByLeaf.get(leaf.toString());
          const name = binding?.label ?? (binding ? shortWallet(binding.wallet) : `member ${i + 1}`);
          const wallet = binding?.wallet ? shortWallet(binding.wallet) : null;
          const showEpoch = props.members.length > 1 && binding;
          const parts = [name];
          if (wallet && binding?.label) parts.push(wallet);
          if (showEpoch) parts.push(`epoch ${binding.epoch}`);
          return {
            id: `leaf-${i}`,
            label: parts.join(" · "),
          };
        }),
      },
    ],
    [analyzed.root, bindingByLeaf, props.members],
  );

  if (props.members.length === 0) return null;

  const keyLabel = primary
    ? who && who !== shortWallet(primary.wallet)
      ? `Key for ${who} (${shortWallet(primary.wallet)}) — stays in this browser`
      : `Key for ${shortWallet(primary.wallet)} — stays in this browser`
    : "Wallet key (stays in this browser)";

  return (
    <VStack gap={3}>
      <Heading level={2}>Who can still prove</Heading>
      <Text type="supporting" color="secondary">
        The agents on the list you opened. Revoke stops all of them.
      </Text>
      <TreeList
        density="compact"
        variant="lineGuides"
        aria-label="Who can still prove"
        items={items}
      />
      {!props.chainChecked ? (
        <>
          <Button
            label="Confirm on Base Sepolia"
            variant="primary"
            isDisabled={props.checkBusy}
            isLoading={props.checkBusy}
            onClick={props.onCheckChain}
          />
          <Text type="supporting" color="secondary">
            Ask Base Sepolia if this list is still live. Then you can stop them.
          </Text>
        </>
      ) : (
        <>
          <TextInput
            label={keyLabel}
            value={props.privateKey}
            onChange={props.onPrivateKey}
            placeholder="0x…"
            type="password"
          />
          <Button
            label={who ? `Revoke ${who}` : "Revoke this root"}
            variant="destructive"
            isDisabled={props.busy}
            isLoading={props.busy}
            onClick={props.onRequestRevoke}
          />
        </>
      )}
    </VStack>
  );
}
