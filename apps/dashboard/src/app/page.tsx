"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Dashboard } from "../components/Dashboard";
import { GuestTry } from "../components/GuestTry";
import { GUEST_COPY } from "../lib/guest-copy";
import { useThemeMode } from "../theme/ThemeModeProvider";

export default function HomePage() {
  const [surface, setSurface] = useState<"try" | "registry">("try");
  const { mode, toggle } = useThemeMode();

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--color-background-body)",
        color: "var(--color-text-primary)",
        padding: "var(--spacing-6)",
        overflowX: "hidden",
      }}
    >
      <div style={{ maxWidth: surface === "try" ? 640 : 960, margin: "0 auto", minWidth: 0 }}>
        <VStack gap={5}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "var(--spacing-3)",
              flexWrap: "wrap",
            }}
          >
            {surface === "registry" ? (
              <div style={{ marginRight: "auto" }}>
                <Button
                  label={GUEST_COPY.warrantTab}
                  size="sm"
                  variant="secondary"
                  onClick={() => setSurface("try")}
                />
              </div>
            ) : null}
            <HStack gap={2} vAlign="center">
              <Text type="supporting" color="secondary">
                Base Sepolia
              </Text>
              <Button
                label={mode === "light" ? "Dark" : "Light"}
                variant="secondary"
                size="sm"
                onClick={toggle}
              />
              {surface === "try" ? (
                <Button
                  label={GUEST_COPY.registry}
                  variant="secondary"
                  size="sm"
                  onClick={() => setSurface("registry")}
                />
              ) : null}
            </HStack>
          </div>
          {surface === "try" ? <GuestTry /> : <Dashboard embedded />}
        </VStack>
      </div>
    </main>
  );
}
