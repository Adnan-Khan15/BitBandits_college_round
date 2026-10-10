// packages/engine/src/features.ts
// Resolver weights, similarity functions and candidate scoring (PLAN 11.2).
// Browser-safe: no Node imports.

import type { ElementFingerprint, FeatureEvidence, Rect } from '@patchwork/shared';
import { DEFAULT_THRESHOLDS } from '@patchwork/shared';

// Weights adapt Similo (PLAN 11.2).
export const WEIGHTS = {
  tag: 1.5,
  id: 1.5,
  testId: 1.5,
  name: 1.5,
  text: 1.5,
  neighborText: 1.5,
  accessibleName: 1.0,
  classes: 0.5,
  hrefSrc: 0.5,
  xpath: 0.5,
  ancestors: 0.5,
  siblingIndex: 0.25,
  rect: 0.5,
} as const;

export type FeatureName = keyof typeof WEIGHTS;

// tag related-groups: {a, button, input[type=submit|button], [role=button]} (PLAN 11.2).
const BUTTON_LIKE_TAGS = new Set(['a', 'button', 'input']);

export function tagSimilarity(fpTag: string, candTag: string): number {
  if (fpTag === candTag) return 1;
  if (BUTTON_LIKE_TAGS.has(fpTag) && BUTTON_LIKE_TAGS.has(candTag)) return 0.5;
  return 0;
}

// --- similarity functions --------------------------------------------------

export function equalitySimilarity(a: string | null, b: string | null): number {
  if (a === null && b === null) return 1;
  if (a === null || b === null) return 0;
  return a === b ? 1 : 0;
}

export function normalisedLevenshtein(a: string, b: string): number {
  const aCapped = a.slice(0, 200);
  const bCapped = b.slice(0, 200);
  const maxLen = Math.max(aCapped.length, bCapped.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(aCapped, bCapped) / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[b.length] ?? 0;
}

export function wordOverlapSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 0));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 0));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  return shared / Math.max(wordsA.size, wordsB.size);
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const v of setA) if (setB.has(v)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function rectSimilarity(a: Rect | null, b: Rect | null): number {
  if (!a || !b) return 0;
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (left >= right || top >= bottom) return 0;
  const intersection = (right - left) * (bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union <= 0 ? 0 : intersection / union;
}

// Ancestors are compared order-insensitively (Similo aligns ancestor sequences):
// each fingerprint ancestor takes its best match among the candidate's, so an
// element that keeps its lineage after being moved/re-wrapped still scores high.
// A fingerprint ancestor carrying an id is "critical": if the candidate has no
// ancestor with that id, the whole ancestry is heavily discounted (abstain-safe).
function ancestorMatchScore(
  fpA: ElementFingerprint['ancestors'][number],
  candA: ElementFingerprint['ancestors'][number],
): number {
  const tag = fpA.tag === candA.tag ? 0.4 : 0;
  let idScore: number;
  if (fpA.id !== null && candA.id !== null) idScore = fpA.id === candA.id ? 0.4 : 0;
  else if (fpA.id === null && candA.id === null) idScore = 0.3;
  else idScore = 0;
  return tag + idScore + jaccardSimilarity(fpA.classes, candA.classes) * 0.2;
}

export function ancestorSimilarity(
  fpAncestors: ElementFingerprint['ancestors'],
  candAncestors: ElementFingerprint['ancestors'],
): number {
  if (fpAncestors.length === 0) return 0;
  let sum = 0;
  let criticalUnmatched = false;
  for (const fa of fpAncestors) {
    let best = 0;
    for (const ca of candAncestors) best = Math.max(best, ancestorMatchScore(fa, ca));
    sum += best;
    if (fa.id !== null && !candAncestors.some((ca) => ca.id === fa.id)) {
      criticalUnmatched = true;
    }
  }
  const avg = sum / fpAncestors.length;
  return criticalUnmatched ? avg * 0.3 : avg;
}

// --- candidate feature extraction -----------------------------------------

export interface CandidateFeatures {
  el: Element;
  tag: string;
  id: string | null;
  testId: string | null;
  name: string | null;
  text: string;
  neighborText: string;
  accessibleName: string | null;
  classes: string[];
  attrs: Record<string, string>;
  xpath: string;
  ancestors: ElementFingerprint['ancestors'];
  siblingIndex: number;
  rect: Rect | null;
}

const ATTR_KEYS = ['href', 'src', 'alt', 'title', 'type', 'placeholder', 'value'] as const;
const MAX_TEXT_LEN = 200;

function norm(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LEN);
}

function accessibleName(el: Element): string | null {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return norm(ariaLabel);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ref = el.ownerDocument?.getElementById(labelledBy);
    if (ref) return norm(ref.textContent ?? '');
  }
  const id = el.getAttribute('id');
  if (id) {
    const label = el.ownerDocument?.querySelector(`label[for="${id}"]`);
    if (label) return norm(label.textContent ?? '');
  }
  const alt = el.getAttribute('alt');
  if (alt) return norm(alt);
  const title = el.getAttribute('title');
  if (title) return norm(title);
  return null;
}

function allowAttrRecord(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ATTR_KEYS) {
    const v = el.getAttribute(name);
    if (v !== null) out[name] = v;
  }
  return out;
}

function ancestorsOf(el: Element): ElementFingerprint['ancestors'] {
  const out: ElementFingerprint['ancestors'] = [];
  let current: Element | null = el.parentElement;
  while (current && out.length < 5) {
    out.push({
      tag: current.tagName.toLowerCase(),
      id: current.id || null,
      classes: Array.from(current.classList),
    });
    current = current.parentElement;
  }
  return out;
}

function siblingIndexOf(el: Element): number {
  let index = 0;
  let sib: Element | null = el.previousElementSibling;
  while (sib) {
    index++;
    sib = sib.previousElementSibling;
  }
  return index;
}

function neighbourTextOf(el: Element): string {
  const parts: string[] = [];
  const prev = el.previousElementSibling;
  if (prev) parts.push(norm(prev.textContent ?? ''));
  const next = el.nextElementSibling;
  if (next) parts.push(norm(next.textContent ?? ''));
  const parentLabel =
    el.parentElement?.getAttribute('aria-label') ?? el.parentElement?.getAttribute('title');
  if (parentLabel) parts.push(norm(parentLabel));
  return norm(parts.join(' '));
}

function absoluteXPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current.nodeType === 1) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const sameTag = (Array.from(parent.children) as Element[]).filter(
        (c) => c.tagName.toLowerCase() === tag,
      );
      if (sameTag.length > 1) {
        parts.unshift(`${tag}[${sameTag.indexOf(current) + 1}]`);
        current = parent;
        continue;
      }
    }
    parts.unshift(tag);
    current = parent;
  }
  return '/' + parts.join('/');
}

export function extractCandidateFeatures(
  el: Element,
  rects?: Record<string, Rect>,
): CandidateFeatures {
  const rect = rects?.[absoluteXPath(el)] ?? null;
  return {
    el,
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    testId: el.getAttribute('data-testid') || null,
    name: el.getAttribute('name') || null,
    text: norm(el.textContent ?? ''),
    neighborText: neighbourTextOf(el),
    accessibleName: accessibleName(el),
    classes: Array.from(el.classList),
    attrs: allowAttrRecord(el),
    xpath: absoluteXPath(el),
    ancestors: ancestorsOf(el),
    siblingIndex: siblingIndexOf(el),
    rect,
  };
}

// --- scoring ---------------------------------------------------------------

export interface ScoredCandidate {
  score: number;
  evidence: FeatureEvidence[];
}

export function scoreCandidate(fp: ElementFingerprint, cand: CandidateFeatures): ScoredCandidate {
  const evidence: FeatureEvidence[] = [];
  let numerator = 0;
  let denominator = 0;

  const add = (feature: string, weight: number, similarity: number): void => {
    evidence.push({ feature, weight, similarity });
    numerator += weight * similarity;
    denominator += weight;
  };

  // Always-present features.
  add('tag', WEIGHTS.tag, tagSimilarity(fp.tag, cand.tag));
  add('xpath', WEIGHTS.xpath, equalitySimilarity(fp.xpath, cand.xpath));
  add('siblingIndex', WEIGHTS.siblingIndex, fp.siblingIndex === cand.siblingIndex ? 1 : 0);

  if (fp.id !== null) add('id', WEIGHTS.id, equalitySimilarity(fp.id, cand.id));
  if (fp.testId !== null) add('testId', WEIGHTS.testId, equalitySimilarity(fp.testId, cand.testId));
  if (fp.name !== null) add('name', WEIGHTS.name, equalitySimilarity(fp.name, cand.name));
  if (fp.text.length > 0) add('text', WEIGHTS.text, normalisedLevenshtein(fp.text, cand.text));
  // neighbourText is only informative when BOTH sides have neighbours (same idea
  // as rect below). A moved element legitimately loses its old neighbours; that
  // must not be scored as total neighbour disagreement.
  if (fp.neighborText.length > 0 && cand.neighborText.length > 0)
    add('neighborText', WEIGHTS.neighborText, wordOverlapSimilarity(fp.neighborText, cand.neighborText));
  if (fp.accessibleName !== null)
    add('accessibleName', WEIGHTS.accessibleName, equalitySimilarity(fp.accessibleName, cand.accessibleName));
  if (fp.classes.length > 0)
    add('classes', WEIGHTS.classes, jaccardSimilarity(fp.classes, cand.classes));

  const fpHrefSrc = fp.attrs.href ?? fp.attrs.src ?? null;
  const candHrefSrc = cand.attrs.href ?? cand.attrs.src ?? null;
  if (fpHrefSrc !== null) add('hrefSrc', WEIGHTS.hrefSrc, equalitySimilarity(fpHrefSrc, candHrefSrc));

  if (fp.ancestors.length > 0)
    add('ancestors', WEIGHTS.ancestors, ancestorSimilarity(fp.ancestors, cand.ancestors));

  // rect only when both sides have one (PLAN 11.2).
  if (fp.rect && cand.rect) add('rect', WEIGHTS.rect, rectSimilarity(fp.rect, cand.rect));

  const score = denominator > 0 ? numerator / denominator : 0;
  evidence.sort((a, b) => b.weight * b.similarity - a.weight * a.similarity);
  return { score, evidence };
}

// --- thresholds ------------------------------------------------------------

export interface Thresholds {
  exact: number;
  relocate: number;
  margin: number;
}

export function getThresholds(override?: Partial<Thresholds>): Thresholds {
  return {
    exact: override?.exact ?? DEFAULT_THRESHOLDS.exact,
    relocate: override?.relocate ?? DEFAULT_THRESHOLDS.relocate,
    margin: override?.margin ?? DEFAULT_THRESHOLDS.margin,
  };
}
