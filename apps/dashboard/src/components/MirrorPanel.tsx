"use client";

import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";

export type MirrorPanelProps = {
  mirrorJson: string;
  onMirrorJson: (v: string) => void;
  onImport: () => void;
};

export function MirrorPanel(props: MirrorPanelProps) {
  return (
    <VStack gap={3}>
      <Heading level={2}>Local mandate tree</Heading>
      <Text type="supporting" color="secondary">
        Paste agent-style mirror JSON (`members`, `bindings`) then import. Siblings
        for revoke use LeanIMT + poseidon-lite — no circuits.
      </Text>
      <TextArea
        label="Mirror JSON"
        value={props.mirrorJson}
        onChange={props.onMirrorJson}
        rows={8}
      />
      <Button label="Import mirror" variant="secondary" onClick={props.onImport} />
    </VStack>
  );
}
