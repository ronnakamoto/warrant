"use client";

import type { ReactNode } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { carbonG10Theme } from "../../theme/carbon-g10.js";
import "../../theme/carbon-g10.css";
import { ThemeModeProvider, useThemeMode } from "../theme/ThemeModeProvider";

function Themed({ children }: { children: ReactNode }) {
  const { mode } = useThemeMode();
  return (
    <Theme theme={carbonG10Theme} mode={mode}>
      {children}
    </Theme>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeModeProvider>
      <Themed>{children}</Themed>
    </ThemeModeProvider>
  );
}
