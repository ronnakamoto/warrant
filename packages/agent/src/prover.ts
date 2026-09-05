import { SnarkjsProver } from "@warrant/core";
import { assertArtifacts, artifactPaths } from "./paths.js";

/**
 * Composition-root helper — call only from `cli.ts` / demo session (`new` here).
 * `prove-flow` must receive an injected `IProver`.
 */
export function createSnarkjsProver(): SnarkjsProver {
  const paths = assertArtifacts(artifactPaths());
  return new SnarkjsProver(paths.wasm, paths.zkey);
}
