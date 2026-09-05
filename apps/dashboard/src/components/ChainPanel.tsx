"use client";

import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { Address } from "viem";
import { isAddress } from "viem";
import { explorerAddressUrl } from "../lib/registry";

export type ChainPanelProps = {
  rpcUrl: string;
  registry: string;
  privateKey: string;
  chainRoot: string;
  localRoot: string;
  busy: boolean;
  onRpcUrl: (v: string) => void;
  onRegistry: (v: string) => void;
  onPrivateKey: (v: string) => void;
  onRefresh: () => void;
};

export function ChainPanel(props: ChainPanelProps) {
  return (
    <VStack gap={3}>
      <Heading level={2}>Chain</Heading>
      <TextInput label="RPC URL" value={props.rpcUrl} onChange={props.onRpcUrl} />
      <TextInput
        label="MandateRegistry"
        value={props.registry}
        onChange={props.onRegistry}
        placeholder="0x…"
      />
      <TextInput
        label="Private key (demo — browser only)"
        value={props.privateKey}
        onChange={props.onPrivateKey}
        placeholder="0x…"
        type="password"
      />
      <HStack gap={2} vAlign="center">
        <Button
          label="Refresh currentRoot"
          variant="secondary"
          isDisabled={props.busy}
          isLoading={props.busy}
          onClick={props.onRefresh}
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
      </HStack>
      <Text type="code">
        chain currentRoot: {props.chainRoot || "—"} · local: {props.localRoot || "0"}
      </Text>
    </VStack>
  );
}
