// packages/engine/src/index.ts (owner: Dev B)
// Browser-safe public API (PLAN 11.14). The Node-only entry is src/node.ts.
export { captureFingerprint, uniqueCssPath } from './fingerprint.js';
export { resolveAnchor, resolveBestMatch, type ResolveMode, type ResolveOptions } from './resolve.js';
export { applyPatch } from './apply.js';
export { analyzeConflicts } from './conflicts.js';
export { analyzeDrift } from './drift.js';
export {
  WEIGHTS,
  tagSimilarity,
  equalitySimilarity,
  normalisedLevenshtein,
  wordOverlapSimilarity,
  jaccardSimilarity,
  rectSimilarity,
  ancestorSimilarity,
  extractCandidateFeatures,
  scoreCandidate,
  getThresholds,
  type CandidateFeatures,
  type Thresholds,
} from './features.js';
