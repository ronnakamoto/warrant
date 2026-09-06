import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { artifactPaths, assertArtifacts, repoRoot, type ArtifactPaths } from "./paths.js";

export function artifactsPresent(paths: ArtifactPaths = artifactPaths()): boolean {
  return existsSync(paths.zkey) && existsSync(paths.wasm) && existsSync(paths.vkey);
}

/** Download the zkey if missing. No-op when the files are already on disk. */
export function ensureArtifacts(
  download: (script: string) => void = (script) =>
    execFileSync("bash", [script], { stdio: "inherit" }),
): ArtifactPaths {
  const paths = artifactPaths();
  if (!artifactsPresent(paths)) {
    download(join(repoRoot(), "scripts/download-zkey.sh"));
  }
  return assertArtifacts(paths);
}
