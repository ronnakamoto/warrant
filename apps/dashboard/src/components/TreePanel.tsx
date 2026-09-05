"use client";

import { useMemo } from "react";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/Layout";
import { TreeList } from "@astryxdesign/core/TreeList";
import { hashLeaf } from "../lib/leaf";
import type { BindingRow } from "../lib/mirror";
import { analyzeMembers } from "../lib/tree";

function short(v: string, n = 10): string {
  if (v.length <= n * 2 + 1) return v;
  return `${v.slice(0, n)}…${v.slice(-n)}`;
}

export type TreePanelProps = {
  members: readonly bigint[];
  bindings: readonly BindingRow[];
  busy: boolean;
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

  const items = useMemo(
    () => [
      {
        id: "root",
        label: `currentRoot ${analyzed.root === 0n ? "(empty)" : short(analyzed.root.toString())}`,
        isExpanded: true,
        children: props.members.map((leaf, i) => {
          const binding = bindingByLeaf.get(leaf.toString());
          const label = binding?.label ?? binding?.wallet ?? `leaf[${i}]`;
          return {
            id: `leaf-${i}`,
            label: `${label} · epoch ${binding?.epoch ?? "?"} · ${short(leaf.toString())}`,
          };
        }),
      },
    ],
    [analyzed.root, bindingByLeaf, props.members],
  );

  return (
    <VStack gap={3}>
      <TreeList
        density="compact"
        variant="lineGuides"
        aria-label="Mandate membership tree"
        items={items}
      />
      <Button
        label="Revoke"
        variant="destructive"
        isDisabled={props.busy || props.members.length === 0}
        isLoading={props.busy}
        onClick={props.onRequestRevoke}
      />
    </VStack>
  );
}
