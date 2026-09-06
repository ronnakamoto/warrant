export { loadGraphStatus } from "./graph.js";
export { warrantFetch, createWarrantFetch, type WarrantFetchOptions } from "./fetch.js";
export { proveForChallenge, warrantHeaderJson, type ProveResult } from "./prove-flow.js";
export { createSnarkjsProver } from "./prover.js";
export { bindRootOnChain, readCurrentRoot } from "./bind.js";
export { readBinding, type SyncRootResult } from "./sync-root.js";
export {
  TierZeroPersonhood,
  AgentBookPersonhood,
  personhoodFromEnv,
} from "./personhood.js";
export {
  loadState,
  saveState,
  defaultStorePath,
  parseScope,
  parseTtl,
  emptyState,
  ensureIdentity,
  identityOf,
  appendLeaf,
  requireTags,
  freshFieldTag,
  type WarrantState,
} from "./store.js";
