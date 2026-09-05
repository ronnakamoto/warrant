/**
 * Warrant dashboard theme — IBM Carbon g10 (light) / g100 (dark) roles on Astryx.
 *
 * Not a stock Astryx theme. Tokens map Carbon color/layer/type roles:
 *   interactive / brand  → Blue 60 `#0f62fe` (accent)
 *   text-primary         → Gray 100 `#161616` / Gray 10 on g100
 *   background / layer   → White + Gray 10 / Gray 100 + Gray 90
 *   support-error        → `#da1e28` (Revoke / destructive)
 *
 * Build: `pnpm exec astryx theme build theme/carbon-g10.ts`
 * Import built CSS + JS from `theme/carbon-g10.{css,js}`.
 */
import { defineTheme } from "@astryxdesign/core/theme";

export const carbonG10Theme = defineTheme({
  name: "carbon-g10",

  color: {
    accent: "#0f62fe",
    neutralStyle: "cool",
    contrast: "standard",
  },

  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: {
      family: "IBM Plex Sans",
      fallbacks: '"Helvetica Neue", Arial, sans-serif',
      weight: "normal",
    },
    heading: {
      family: "IBM Plex Sans",
      fallbacks: '"Helvetica Neue", Arial, sans-serif',
      weight: "semibold",
      weights: { 1: "semibold", 2: "semibold", 3: "medium" },
    },
    code: {
      family: "IBM Plex Mono",
      fallbacks: "ui-monospace, Menlo, monospace",
    },
  },

  /** Carbon is relatively sharp — keep radii modest. */
  radius: { base: 2, multiplier: 1 },

  motion: { fast: 110, medium: 240, slow: 700, ratio: 0.75 },

  tokens: {
    // Carbon g10 / g100 surfaces & text (light, dark)
    "--color-background-body": ["#ffffff", "#161616"],
    "--color-background-surface": ["#f4f4f4", "#262626"],
    "--color-background-card": ["#ffffff", "#262626"],
    "--color-background-muted": ["#e0e0e0", "#393939"],
    "--color-text-primary": ["#161616", "#f4f4f4"],
    "--color-text-secondary": ["#525252", "#c6c6c6"],
    "--color-border": ["#e0e0e0", "#393939"],
    "--color-border-emphasized": ["#8d8d8d", "#6f6f6f"],
    // Blue 60 / Blue 40
    "--color-accent": ["#0f62fe", "#78a9ff"],
    "--color-on-accent": ["#ffffff", "#161616"],
    // support-error / Red 50 on dark
    "--color-error": ["#da1e28", "#ff8389"],
    "--color-on-error": ["#ffffff", "#161616"],
    "--color-error-muted": ["#fff1f1", "#2d0709"],
  },
});
