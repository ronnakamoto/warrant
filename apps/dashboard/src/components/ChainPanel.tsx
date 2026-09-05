"use client";

import { Link } from "@astryxdesign/core/Link";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { Address } from "viem";
import { isAddress } from "viem";
import { explorerAddressUrl } from "../lib/registry";
import { shortRoot } from "../lib/status";

export type ChainPanelProps = {
  rpcUrl: string;
  registry: string;
  chainRoot: string;
  localRoot: string;
  showRoots?: boolean;
  onRpcUrl: (v: string) => void;
  onRegistry: (v: string) => void;
};

export function ChainPanel(props: ChainPanelProps) {
  return (
    <details>
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 600,
          marginBottom: "var(--spacing-3)",
        }}
      >
        Network settings
      </summary>
      <VStack gap={3}>
        <TextInput label="RPC URL" value={props.rpcUrl} onChange={props.onRpcUrl} />
        <TextInput
          label="Registry"
          value={props.registry}
          onChange={props.onRegistry}
          placeholder="0x…"
        />
        {isAddress(props.registry) ? (
          <Link
            href={explorerAddressUrl(props.registry as Address)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open registry on explorer
          </Link>
        ) : null}
        {props.showRoots ? (
          <Text type="supporting" color="secondary">
            Chain {props.chainRoot ? shortRoot(props.chainRoot) : "not checked"} · local{" "}
            {shortRoot(props.localRoot)}
          </Text>
        ) : null}
      </VStack>
    </details>
  );
}
