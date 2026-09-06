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
  graphBusy?: boolean;
  onMirrorJson: (v: string) => void;
  onImport: () => void;
  onLoadText: (raw: string) => void;
  onLoadGraph: () => void;
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
          This page stops every agent you delegated. It loads who that is from
          The Graph (live Base Sepolia index), then talks to the registry.
        </Text>
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            1. Load the live list from The Graph
          </Text>
          <Text type="supporting" color="secondary">
            2. Confirm they’re still live on Base Sepolia
          </Text>
          <Text type="supporting" color="secondary">
            3. Revoke to cut them off
          </Text>
        </VStack>
        <Button
          label={props.graphBusy ? "Loading from The Graph…" : "Load live list from The Graph"}
          variant="primary"
          onClick={props.onLoadGraph}
        />
        <details>
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Use a local file instead
          </summary>
          {drop}
        </details>
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
            The Graph indexes MandateRegistry Bound/Revoked. Baby Jubjub keys
            are read from the contract so revoke can rebuild the Merkle path.
            A local dashboard-mirror.json is only a fallback.
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
        <Button
          label={props.graphBusy ? "Loading from The Graph…" : "Reload from The Graph"}
          variant="primary"
          onClick={props.onLoadGraph}
        />
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
