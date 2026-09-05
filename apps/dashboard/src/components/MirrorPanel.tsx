"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";

export type MirrorPanelProps = {
  mirrorJson: string;
  /** Empty: drop zone first. Loaded: tucked “Load a different list”. */
  expanded?: boolean;
  onMirrorJson: (v: string) => void;
  onImport: () => void;
  onLoadText: (raw: string) => void;
};

function PasteForm(props: {
  mirrorJson: string;
  onMirrorJson: (v: string) => void;
  onImport: () => void;
}) {
  return (
    <VStack gap={3}>
      <TextArea
        label="Paste the file contents"
        value={props.mirrorJson}
        onChange={props.onMirrorJson}
        rows={8}
      />
      <Button label="Use pasted text" variant="secondary" onClick={props.onImport} />
    </VStack>
  );
}

export function MirrorPanel(props: MirrorPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const readFile = useCallback(
    (file: File) => {
      void file.text().then((raw) => props.onLoadText(raw));
    },
    [props.onLoadText],
  );

  const drop = (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
      }}
      style={{
        padding: "var(--spacing-6)",
        border: "1px dashed var(--color-border)",
        background: dragOver
          ? "var(--color-background-surface)"
          : "transparent",
        textAlign: "center",
      }}
    >
      <VStack gap={3}>
        <Text type="body">Drop dashboard-mirror.json here</Text>
        <Text type="supporting" color="secondary">
          Your agent app writes this when you bind and delegate. It is a local
          copy of who you hired — not a secret key.
        </Text>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
            e.target.value = "";
          }}
        />
        <Button
          label="Choose that file"
          variant="primary"
          onClick={() => inputRef.current?.click()}
        />
      </VStack>
    </div>
  );

  if (props.expanded) {
    return (
      <VStack gap={4}>
        <Heading level={2}>Start here</Heading>
        <Text type="body">
          This page stops every agent you delegated. First it needs the list of
          who that is.
        </Text>
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            1. Open dashboard-mirror.json from your agent store
          </Text>
          <Text type="supporting" color="secondary">
            2. Confirm they’re still live on Base Sepolia
          </Text>
          <Text type="supporting" color="secondary">
            3. Revoke to cut them off
          </Text>
        </VStack>
        {drop}
        <details>
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            What is this file?
          </summary>
          <Text type="supporting" color="secondary">
            After `warrant bind-root` and `warrant delegate`, the CLI saves a
            JSON snapshot next to your store (often
            dashboard-mirror.json). This page never talks to the agents
            themselves — it only reads that snapshot, then talks to the
            registry on Base Sepolia.
          </Text>
        </details>
        <details>
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Paste the file instead
          </summary>
          <PasteForm
            mirrorJson={props.mirrorJson}
            onMirrorJson={props.onMirrorJson}
            onImport={props.onImport}
          />
        </details>
      </VStack>
    );
  }

  return (
    <details>
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 600,
          marginBottom: "var(--spacing-3)",
        }}
      >
        Load a different list
      </summary>
      <VStack gap={3}>
        {drop}
        <PasteForm
          mirrorJson={props.mirrorJson}
          onMirrorJson={props.onMirrorJson}
          onImport={props.onImport}
        />
      </VStack>
    </details>
  );
}
