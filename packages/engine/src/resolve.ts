// packages/engine/src/resolve.ts
// Anchor resolution (PLAN 11.2, 11.14): smart / selector (B1) / xpath (B2) plus B3 best-match.
// Browser-safe: no Node imports.

import type { ElementFingerprint, FeatureEvidence, Rect, Resolution } from '@patchwork/shared';
import { LIMITS } from '@patchwork/shared';
import { uniqueCssPath } from './fingerprint.js';
import {
  extractCandidateFeatures,
  getThresholds,
  scoreCandidate,
  type Thresholds,
} from './features.js';

export type ResolveMode = 'smart' | 'selector' | 'xpath';

export interface ResolveOptions {
  mode?: ResolveMode;
  thresholds?: Partial<Thresholds>;
  rects?: Record<string, Rect>;
}

interface Candidate {
  el: Element;
  score: number;
  evidence: FeatureEvidence[];
}

function collectElements(doc: Document): Element[] {
  const root = doc.body;
  if (!root) return [];
  const elements = Array.from(root.querySelectorAll('*')) as Element[];
  elements.unshift(root);
  return elements.slice(0, LIMITS.candidatesCap);
}

function scoreElements(
  doc: Document,
  fp: ElementFingerprint,
  rects?: Record<string, Rect>,
): Candidate[] {
  return collectElements(doc).map((el) => {
    const { score, evidence } = scoreCandidate(fp, extractCandidateFeatures(el, rects));
    return { el, score, evidence };
  });
}

function bestTwo(candidates: Candidate[]): { best: Candidate | null; runnerUp: Candidate | null } {
  let best: Candidate | null = null;
  let runnerUp: Candidate | null = null;
  for (const c of candidates) {
    if (!best || c.score > best.score) {
      runnerUp = best;
      best = c;
    } else if (!runnerUp || c.score > runnerUp.score) {
      runnerUp = c;
    }
  }
  return { best, runnerUp };
}

function selectorMatch(doc: Document, fp: ElementFingerprint): Element | null {
  if (!fp.cssPath) return null;
  let matches: NodeListOf<Element>;
  try {
    matches = doc.querySelectorAll(fp.cssPath);
  } catch {
    return null;
  }
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function xpathMatch(doc: Document, fp: ElementFingerprint): Element | null {
  if (!fp.xpath) return null;
  try {
    const result = doc.evaluate(
      fp.xpath,
      doc,
      null,
      // XPathResult.ORDERED_NODE_SNAPSHOT_TYPE = 7 (avoids the enum binding).
      7,
      null,
    ) as { snapshotLength: number; snapshotItem: (i: number) => Node | null };
    if (result.snapshotLength !== 1) return null;
    const node = result.snapshotItem(0);
    return node && node.nodeType === 1 ? (node as Element) : null;
  } catch {
    return null;
  }
}

function runnerUpOf(runnerUp: Candidate | null): Resolution['runnerUp'] {
  return runnerUp ? { elementPath: uniqueCssPath(runnerUp.el), confidence: runnerUp.score } : null;
}

function emptyResolution(anchorId: string, mode: ResolveMode): Resolution {
  return {
    anchorId,
    status: 'not_found',
    confidence: 0,
    margin: 0,
    elementPath: null,
    evidence: [],
    runnerUp: null,
    mode,
  };
}

export function resolveAnchor(
  doc: Document,
  anchorId: string,
  fp: ElementFingerprint,
  opts: ResolveOptions = {},
): Resolution {
  const mode = opts.mode ?? 'smart';

  if (mode === 'selector') {
    const el = selectorMatch(doc, fp);
    if (!el) return emptyResolution(anchorId, mode);
    return {
      anchorId,
      status: 'exact',
      confidence: 1,
      margin: 1,
      elementPath: uniqueCssPath(el),
      evidence: [],
      runnerUp: null,
      mode,
    };
  }

  if (mode === 'xpath') {
    const el = xpathMatch(doc, fp);
    if (!el) return emptyResolution(anchorId, mode);
    return {
      anchorId,
      status: 'exact',
      confidence: 1,
      margin: 1,
      elementPath: uniqueCssPath(el),
      evidence: [],
      runnerUp: null,
      mode,
    };
  }

  const thresholds = getThresholds(opts.thresholds);
  const scored = scoreElements(doc, fp, opts.rects);
  const { best, runnerUp } = bestTwo(scored);
  if (!best) return emptyResolution(anchorId, mode);

  const margin = runnerUp ? best.score - runnerUp.score : best.score;
  const evidence = best.evidence;
  const runnerUpRef = runnerUpOf(runnerUp);

  const selectorEl = selectorMatch(doc, fp);
  // `exact` requires the stored selector to resolve AND the best candidate to clear
  // the exact threshold AND the runner-up to be clear of it by the margin: a unique
  // selector pointing at an element that has an equally-good twin must abstain.
  const exactViaSelector =
    selectorEl !== null &&
    selectorEl === best.el &&
    best.score >= thresholds.exact &&
    margin >= thresholds.margin;
  const status: Resolution['status'] = exactViaSelector
    ? 'exact'
    : best.score >= thresholds.relocate && margin >= thresholds.margin
      ? 'relocated'
      : best.score >= thresholds.relocate
        ? 'ambiguous'
        : 'not_found';

  return {
    anchorId,
    status,
    confidence: best.score,
    margin,
    elementPath: status === 'not_found' ? null : uniqueCssPath(best.el),
    evidence,
    runnerUp: runnerUpRef,
    mode,
  };
}

/**
 * B3 baseline: top-scoring candidate with no threshold or margin gate.
 * Used by the benchmark only, never by the runtime (PLAN 11.9).
 */
export function resolveBestMatch(
  doc: Document,
  anchorId: string,
  fp: ElementFingerprint,
  opts: Omit<ResolveOptions, 'mode'> = {},
): Resolution {
  const scored = scoreElements(doc, fp, opts.rects);
  const { best, runnerUp } = bestTwo(scored);
  if (!best) return emptyResolution(anchorId, 'smart');
  return {
    anchorId,
    status: 'relocated',
    confidence: best.score,
    margin: runnerUp ? best.score - runnerUp.score : best.score,
    elementPath: uniqueCssPath(best.el),
    evidence: best.evidence,
    runnerUp: runnerUpOf(runnerUp),
    mode: 'smart',
  };
}
