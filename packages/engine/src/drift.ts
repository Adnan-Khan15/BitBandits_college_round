// packages/engine/src/drift.ts
// Drift Sentinel analysis: classify each live patch against a new snapshot (PLAN 6, 11.9, 11.14).
// Browser-safe: no Node imports.

import type { DriftPatchResult, ElementFingerprint, FrozenPatch, Rect } from '@patchwork/shared';
import { resolveAnchor } from './resolve.js';
import { captureFingerprint } from './fingerprint.js';

export function analyzeDrift(
  doc: Document,
  patches: FrozenPatch[],
  rects?: Record<string, Rect>,
): DriftPatchResult[] {
  return patches.map((patch) => {
    const results = Object.entries(patch.anchors).map(([anchorId, fp]) =>
      resolveAnchor(doc, anchorId, fp, { mode: 'smart', rects }),
    );

    const hasNotFound = results.some((r) => r.status === 'not_found');
    const hasAmbiguous = results.some((r) => r.status === 'ambiguous');
    const hasRelocated = results.some((r) => r.status === 'relocated');
    const allExact = results.every((r) => r.status === 'exact');

    const health: DriftPatchResult['health'] = allExact
      ? 'healthy'
      : hasNotFound
        ? 'broken'
        : hasAmbiguous
          ? 'at_risk'
          : hasRelocated
            ? 'healed'
            : 'broken';

    let proposedFingerprints: Record<string, ElementFingerprint> | null = null;
    if (health === 'healed') {
      proposedFingerprints = {};
      for (const res of results) {
        if (!res.elementPath) continue;
        const el = doc.querySelector(res.elementPath);
        if (!el) continue;
        proposedFingerprints[res.anchorId] = captureFingerprint(el, { capturedFromHash: 'drift' });
      }
    }

    return {
      patchId: patch.patchId,
      revision: patch.revision,
      health,
      resolutions: results,
      proposedFingerprints,
      assist: [],
    };
  });
}
