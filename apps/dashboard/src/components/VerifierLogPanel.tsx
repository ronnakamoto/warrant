"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Link } from "@astryxdesign/core/Link";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import type { VerifierLogEntry } from "../lib/registry";

export type VerifierLogPanelProps = {
  log: readonly VerifierLogEntry[];
};

export function VerifierLogPanel(props: VerifierLogPanelProps) {
  return (
    <VStack gap={3}>
      <Heading level={2}>Verifier log</Heading>
      {props.log.length === 0 ? (
        <Text type="supporting" color="secondary">
          Revoke and root reads appear here with explorer links.
        </Text>
      ) : (
        <VStack gap={2}>
          {props.log.map((entry) => (
            <div
              key={entry.id}
              style={{
                padding: "var(--spacing-3)",
                background: "var(--color-background-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              <HStack gap={2} vAlign="center">
                <Badge
                  variant={
                    entry.kind === "error"
                      ? "error"
                      : entry.kind === "revoked"
                        ? "warning"
                        : "info"
                  }
                  label={entry.kind}
                />
                <Text type="supporting" color="secondary">
                  {entry.at}
                </Text>
              </HStack>
              <Text type="body">{entry.message}</Text>
              {entry.href ? (
                <Link href={entry.href} target="_blank" rel="noopener noreferrer">
                  View on explorer
                </Link>
              ) : null}
            </div>
          ))}
        </VStack>
      )}
    </VStack>
  );
}
