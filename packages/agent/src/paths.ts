import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Walk up from packages/agent/src to the monorepo root. */
export function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "../../..");
}

export type ArtifactPaths = {
  wasm: string;
  zkey: string;
  vkey: string;
};

export function artifactPaths(root = repoRoot()): ArtifactPaths {
  return {
    wasm:
      process.env.WARRANT_WASM_PATH ??
      join(root, "circuits/build/warrant_js/warrant.wasm"),
    zkey: process.env.WARRANT_ZKEY_PATH ?? join(root, "circuits/build/warrant_final.zkey"),
    vkey: process.env.WARRANT_VKEY_PATH ?? join(root, "circuits/build/warrant_vkey.json"),
  };
}

export function assertArtifacts(paths: ArtifactPaths = artifactPaths()): ArtifactPaths {
  for (const [k, p] of Object.entries(paths) as [keyof ArtifactPaths, string][]) {
    if (!existsSync(p)) {
      throw new Error(
        `missing ${k} at ${p} — run scripts/download-zkey.sh or setup-groth16`,
      );
    }
  }
  return paths;
}
