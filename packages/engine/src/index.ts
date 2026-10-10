// OWNER: Dev B - replace this stub (docs/PLAN.md sections 11.14, 13.4)
// Browser-safe: no Node imports here. The Node-only entry is src/node.ts.
import type {
  ConflictReport,
  DriftPatchResult,
  ElementFingerprint,
  FrozenPatch,
  Rect,
  Resolution,
  RuntimeManifest,
  RuntimePatchStatus,
} from '@patchwork/shared';
import { AppError } from '@patchwork/shared';

const stub = (fn: string): never => {
  throw new AppError('NOT_IMPLEMENTED', `engine.${fn} is a scaffold stub (owner: Dev B)`);
};

export function captureFingerprint(
  _el: Element,
  _opts?: { withRect?: boolean; capturedFromHash?: string },
): ElementFingerprint {
  return stub('captureFingerprint');
}

export function uniqueCssPath(_el: Element): string {
  return stub('uniqueCssPath');
}

export function resolveAnchor(
  _doc: Document,
  _anchorId: string,
  _fp: ElementFingerprint,
  _opts?: {
    mode?: 'smart' | 'selector' | 'xpath';
    thresholds?: RuntimeManifest['thresholds'];
    rects?: Record<string, Rect>;
  },
): Resolution {
  return stub('resolveAnchor');
}

export function applyPatch(
  _doc: Document,
  _patch: FrozenPatch,
  _opts: { mode: 'smart' | 'selector'; thresholds: RuntimeManifest['thresholds'] },
): RuntimePatchStatus {
  return stub('applyPatch');
}
// (patch validation is NOT in the engine; it lives in core, owner A - apps/server/src/core/validate.ts)

export function analyzeConflicts(
  _doc: Document,
  _against: FrozenPatch[],
  _candidates: FrozenPatch[],
): Pick<
  ConflictReport,
  'candidateIds' | 'againstIds' | 'resolutions' | 'conflicts' | 'blocking'
> {
  return stub('analyzeConflicts');
}

export function analyzeDrift(
  _doc: Document,
  _patches: FrozenPatch[],
  _rects?: Record<string, Rect>,
): DriftPatchResult[] {
  return stub('analyzeDrift');
}
