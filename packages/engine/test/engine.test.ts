// packages/engine/test/engine.test.ts (owner: Dev B)
// @vitest-environment jsdom
// Unit tests for the browser-safe engine surface (PLAN 11.2, 11.3, 11.5, 11.6, 11.9).
import { describe, expect, it } from 'vitest';
import type { FrozenPatch, PatchOp } from '@patchwork/shared';
import {
  analyzeConflicts,
  analyzeDrift,
  ancestorSimilarity,
  applyPatch,
  captureFingerprint,
  equalitySimilarity,
  extractCandidateFeatures,
  getThresholds,
  jaccardSimilarity,
  normalisedLevenshtein,
  rectSimilarity,
  resolveAnchor,
  resolveBestMatch,
  scoreCandidate,
  tagSimilarity,
  uniqueCssPath,
  wordOverlapSimilarity,
} from '../src/index.js';
import { documentFromHtml } from '../src/node.js';

const URL_ = 'https://target.local/';
const defaultThresholds = { exact: 0.9, relocate: 0.65, margin: 0.15 };

function doc(body: string, url = URL_): Document {
  return documentFromHtml(`<!doctype html><html><body>${body}</body></html>`, url).document;
}

function fpOf(document: Document, selector: string) {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`fixture element not found: ${selector}`);
  return captureFingerprint(el);
}

function makePatch(over: Partial<FrozenPatch> & Pick<FrozenPatch, 'anchors' | 'ops'>): FrozenPatch {
  return {
    patchId: 'p1',
    revision: 1,
    title: 'test patch',
    urlPath: '/',
    checks: [],
    baseSnapshotId: null,
    baseValues: {},
    ...over,
  };
}

describe('fingerprint', () => {
  it('captures tag, id, classes, text, ancestors (nearest first), xpath and sibling index', () => {
    const d = doc(
      '<div class="wrap"><section id="main"><button id="save" class="btn primary">Save</button></section></div>',
    );
    const fp = fpOf(d, '#save');
    expect(fp.tag).toBe('button');
    expect(fp.id).toBe('save');
    expect(fp.classes).toEqual(['btn', 'primary']);
    expect(fp.text).toBe('Save');
    expect(fp.cssPath).toBe('#save');
    expect(fp.xpath).toBe('/html/body/div/section/button');
    expect(fp.siblingIndex).toBe(0);
    expect(fp.ancestors.map((a) => a.tag)).toEqual(['section', 'div', 'body', 'html']);
    expect(uniqueCssPath(d.querySelector('#save')!)).toBe('#save');
  });

  it('prefers data-testid when there is no id', () => {
    const d = doc('<div class="wrap"><button data-testid="save-btn">Save</button></div>');
    const fp = fpOf(d, 'button');
    expect(fp.cssPath).toBe('[data-testid="save-btn"]');
  });

  it('collects previous/next sibling text as neighbourText', () => {
    const d = doc('<div class="wrap"><span>Home</span><a id="acct" href="/a">Orders</a><span>Cart</span></div>');
    const fp = fpOf(d, '#acct');
    expect(fp.neighborText).toBe('Home Cart');
    expect(fp.attrs.href).toBe('/a');
  });
});

describe('similarity functions', () => {
  it('tagSimilarity treats button-like tags as related', () => {
    expect(tagSimilarity('button', 'button')).toBe(1);
    expect(tagSimilarity('a', 'button')).toBe(0.5);
    expect(tagSimilarity('a', 'span')).toBe(0);
  });

  it('equalitySimilarity treats two nulls as equal but null vs value as unequal', () => {
    expect(equalitySimilarity(null, null)).toBe(1);
    expect(equalitySimilarity('x', 'x')).toBe(1);
    expect(equalitySimilarity('x', 'y')).toBe(0);
    expect(equalitySimilarity('x', null)).toBe(0);
  });

  it('normalisedLevenshtein is 1 for equal strings and 0 for disjoint', () => {
    expect(normalisedLevenshtein('', '')).toBe(1);
    expect(normalisedLevenshtein('abc', 'abc')).toBe(1);
    expect(normalisedLevenshtein('abc', 'abd')).toBeCloseTo(2 / 3, 5);
  });

  it('wordOverlapSimilarity is the token overlap ratio', () => {
    expect(wordOverlapSimilarity('', '')).toBe(1);
    expect(wordOverlapSimilarity('a b', 'a c')).toBeCloseTo(0.5, 5);
    expect(wordOverlapSimilarity('a', '')).toBe(0);
  });

  it('jaccardSimilarity handles empty sets and overlap', () => {
    expect(jaccardSimilarity([], [])).toBe(1);
    expect(jaccardSimilarity(['a'], [])).toBe(0);
    expect(jaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 5);
  });

  it('rectSimilarity is IoU and 0 when rects are absent or disjoint', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectSimilarity(r, r)).toBe(1);
    expect(rectSimilarity(null, r)).toBe(0);
    expect(rectSimilarity(r, { x: 20, y: 20, width: 10, height: 10 })).toBe(0);
  });

  it('ancestorSimilarity is order-insensitive and penalises a critical id mismatch', () => {
    expect(ancestorSimilarity([], [])).toBe(0);
    const a = [{ tag: 'li', id: 'row-a', classes: ['r'] }];
    expect(ancestorSimilarity(a, a)).toBe(1);
    expect(ancestorSimilarity(a, [{ tag: 'li', id: 'row-b', classes: ['r'] }])).toBeLessThan(0.2);
  });
});

describe('scoreCandidate / extractCandidateFeatures', () => {
  it('scores an unchanged element at ~1', () => {
    const d = doc('<div class="wrap"><button id="save" class="btn">Save</button></div>');
    const el = d.querySelector('#save')!;
    const fp = captureFingerprint(el);
    const cand = extractCandidateFeatures(el);
    expect(cand.tag).toBe('button');
    expect(scoreCandidate(fp, cand).score).toBeGreaterThan(0.98);
  });

  it('exposes weighted evidence', () => {
    const d = doc('<div class="wrap"><button id="save">Save</button></div>');
    const fp = fpOf(d, '#save');
    const { evidence } = scoreCandidate(fp, extractCandidateFeatures(d.querySelector('#save')!));
    expect(evidence.some((e) => e.feature === 'tag' && e.similarity === 1)).toBe(true);
  });
});

describe('getThresholds', () => {
  it('returns defaults and applies partial overrides', () => {
    expect(getThresholds()).toEqual(defaultThresholds);
    expect(getThresholds({ margin: 0.3 })).toEqual({ ...defaultThresholds, margin: 0.3 });
  });
});

describe('resolveAnchor', () => {
  it('selector mode is exact only when the stored cssPath is unique', () => {
    const d = doc('<div class="wrap"><button id="save">Save</button></div>');
    const fp = fpOf(d, '#save');
    const exact = resolveAnchor(d, 'a1', fp, { mode: 'selector' });
    expect(exact.status).toBe('exact');
    expect(exact.confidence).toBe(1);

    const dup = doc('<div class="wrap"><button class="dup">x</button><button class="dup">x</button></div>');
    const dupFp = replicateWithoutPath(fpOf(dup, '.dup'));
    expect(resolveAnchor(dup, 'a1', dupFp, { mode: 'selector' }).status).toBe('not_found');
  });

  it('smart mode returns exact for a unique unchanged element', () => {
    const d = doc('<div class="wrap"><button id="save" class="btn">Save</button></div>');
    const fp = fpOf(d, '#save');
    const res = resolveAnchor(d, 'a1', fp, { mode: 'smart' });
    expect(res.status).toBe('exact');
    expect(res.elementPath).toBe('#save');
  });

  it('smart mode relocates a renamed element', () => {
    const before = doc('<div class="wrap"><button id="save" class="btn">Save</button></div>');
    const after = doc('<div class="wrap"><button id="save2" class="btn">Save</button></div>');
    const res = resolveAnchor(after, 'a1', fpOf(before, '#save'), { mode: 'smart' });
    expect(res.status).toBe('relocated');
    expect(res.elementPath).toBe('#save2');
    expect(res.margin).toBeGreaterThanOrEqual(defaultThresholds.margin);
  });

  it('smart mode abstains (ambiguous) when two elements tie', () => {
    const before = doc('<div class="wrap"><ul><li><button class="add-to-cart">Add</button></li><li><button class="add-to-cart">Add</button></li></ul></div>');
    const after = doc('<div class="wrap"><ul><li><button class="add-to-cart">Add</button></li><li><button class="add-to-cart">Add</button></li></ul></div>');
    const res = resolveAnchor(after, 'a1', fpOf(before, 'li:first-child .add-to-cart'), { mode: 'smart' });
    expect(res.status).toBe('ambiguous');
    expect(res.confidence).toBeGreaterThanOrEqual(defaultThresholds.relocate);
  });

  it('smart mode returns not_found when the element is gone', () => {
    const before = doc('<div class="wrap"><button id="save" class="btn">Save</button></div>');
    const after = doc('<div class="wrap"><p>nothing here</p></div>');
    const res = resolveAnchor(after, 'a1', fpOf(before, '#save'), { mode: 'smart' });
    expect(res.status).toBe('not_found');
    expect(res.elementPath).toBeNull();
  });

  it('xpath mode resolves through the stored absolute xpath', () => {
    const d = doc('<div class="wrap"><button id="save">Save</button></div>');
    const fp = fpOf(d, '#save');
    expect(resolveAnchor(d, 'a1', fp, { mode: 'xpath' }).status).toBe('exact');
  });
});

describe('resolveBestMatch (B3 baseline)', () => {
  it('always returns the top candidate, even below the relocate threshold', () => {
    const before = doc('<div class="wrap"><button id="save" class="btn">Save</button></div>');
    const after = doc('<div class="wrap"><p>unrelated</p></div>');
    const res = resolveBestMatch(after, 'a1', fpOf(before, '#save'));
    expect(res.status).toBe('relocated');
    expect(res.elementPath).not.toBeNull();
  });
});

describe('applyPatch', () => {
  it('reports path_mismatch before touching the DOM', () => {
    const d = doc('<div class="wrap"><button id="save">Save</button></div>', 'https://target.local/cart');
    const p = makePatch({ urlPath: '/other', anchors: { a1: fpOf(d, '#save') }, ops: [{ kind: 'setText', target: { anchor: 'a1' }, value: 'X' }] });
    expect(applyPatch(d, p, { mode: 'smart', thresholds: defaultThresholds }).reason).toBe('path_mismatch');
  });

  it('reports anchor_not_found when the anchor cannot be resolved', () => {
    const before = doc('<div class="wrap"><button id="save">Save</button></div>');
    const after = doc('<div class="wrap"><p>gone</p></div>');
    const p = makePatch({ anchors: { a1: fpOf(before, '#save') }, ops: [{ kind: 'setText', target: { anchor: 'a1' }, value: 'X' }] });
    expect(applyPatch(after, p, { mode: 'smart', thresholds: defaultThresholds }).reason).toBe('anchor_not_found');
  });

  it('applies setText/setAttribute/setStyle/hide and marks elements applied', () => {
    const d = doc('<div class="wrap"><p id="intro">Old</p><button id="go">Go</button></div>');
    const ops: PatchOp[] = [
      { kind: 'setText', target: { anchor: 'intro' }, value: 'New' },
      { kind: 'setAttribute', target: { anchor: 'go' }, name: 'title', value: 'tip' },
      { kind: 'setStyle', target: { anchor: 'intro' }, property: 'color', value: 'red' },
      { kind: 'hide', target: { anchor: 'go' } },
    ];
    const p = makePatch({ anchors: { intro: fpOf(d, '#intro'), go: fpOf(d, '#go') }, ops });
    const status = applyPatch(d, p, { mode: 'smart', thresholds: defaultThresholds });
    expect(status.applied).toBe(true);
    expect(status.reason).toBe('ok');
    expect(d.querySelector('#intro')!.textContent).toBe('New');
    expect(d.querySelector('#intro')!.getAttribute('style')).toContain('color: red');
    expect(d.querySelector('#go')!.getAttribute('title')).toBe('tip');
    expect((d.querySelector('#go') as HTMLElement).style.display).toBe('none');
    expect(d.querySelector('#intro')!.getAttribute('data-pw-applied')).toBe('p1:1');
  });

  it('is idempotent on a second run', () => {
    const d = doc('<div class="wrap"><p id="intro">Old</p></div>');
    const p = makePatch({ anchors: { intro: fpOf(d, '#intro') }, ops: [{ kind: 'setText', target: { anchor: 'intro' }, value: 'New' }] });
    applyPatch(d, p, { mode: 'smart', thresholds: defaultThresholds });
    const second = applyPatch(d, p, { mode: 'smart', thresholds: defaultThresholds });
    expect(second.applied).toBe(true);
    expect(d.querySelector('#intro')!.textContent).toBe('New');
  });

  it('rolls back atomically when an op fails', () => {
    const d = doc('<div class="wrap"><p id="intro">Old</p></div>');
    const ops: PatchOp[] = [
      { kind: 'setText', target: { anchor: 'intro' }, value: 'New' },
      { kind: 'move', target: { anchor: 'intro' }, reference: { anchor: 'missing' }, position: 'before' },
    ];
    const p = makePatch({ anchors: { intro: fpOf(d, '#intro') }, ops });
    const status = applyPatch(d, p, { mode: 'smart', thresholds: defaultThresholds });
    expect(status.applied).toBe(false);
    expect(status.reason).toBe('op_error');
    expect(status.error).toContain('missing');
    expect(d.querySelector('#intro')!.textContent).toBe('Old');
  });
});

describe('analyzeConflicts', () => {
  function twoPatches(opsA: PatchOp[], opsB: PatchOp[], anchorsA?: Record<string, ReturnType<typeof fpOf>>, anchorsB?: Record<string, ReturnType<typeof fpOf>>) {
    const d = doc('<div class="wrap"><p id="t">base</p><div id="box"><span id="child">c</span></div><button id="go">Go</button></div>');
    const a = makePatch({ patchId: 'pA', anchors: anchorsA ?? { t: fpOf(d, '#t') }, ops: opsA });
    const b = makePatch({ patchId: 'pB', anchors: anchorsB ?? { t: fpOf(d, '#t') }, ops: opsB });
    return { d, a, b };
  }

  it('flags SAME_PROPERTY as blocking when both patches set different text', () => {
    const { d, a, b } = twoPatches([{ kind: 'setText', target: { anchor: 't' }, value: 'A' }], [{ kind: 'setText', target: { anchor: 't' }, value: 'B' }]);
    const report = analyzeConflicts(d, [a], [b]);
    expect(report.conflicts.some((c) => c.type === 'SAME_PROPERTY' && c.severity === 'blocking')).toBe(true);
    expect(report.blocking).toBe(true);
  });

  it('flags UNRESOLVED_TARGET when a candidate anchor is missing', () => {
    const before = doc('<div class="wrap"><button id="save" class="btn">Save</button></div>');
    const target = doc('<div class="wrap"></div>');
    const cand = makePatch({ patchId: 'pB', anchors: { t: fpOf(before, '#save') }, ops: [{ kind: 'setText', target: { anchor: 't' }, value: 'A' }] });
    const report = analyzeConflicts(target, [], [cand]);
    expect(report.conflicts.some((c) => c.type === 'UNRESOLVED_TARGET')).toBe(true);
  });

  it('flags MOVE_MOVE when both patches move the same element', () => {
    const d = doc('<div class="wrap"><p id="t">base</p><button id="go">Go</button></div>');
    const anchors = { t: fpOf(d, '#t'), go: fpOf(d, '#go') };
    const moveOp: PatchOp = { kind: 'move', target: { anchor: 't' }, reference: { anchor: 'go' }, position: 'after' };
    const a = makePatch({ patchId: 'pA', anchors, ops: [moveOp] });
    const b = makePatch({ patchId: 'pB', anchors, ops: [moveOp] });
    const report = analyzeConflicts(d, [a], [b]);
    expect(report.conflicts.some((c) => c.type === 'MOVE_MOVE')).toBe(true);
  });

  it('flags EDIT_HIDDEN as a warning when one patch hides what another edits', () => {
    const d = doc('<div class="wrap"><div id="box"><span id="child">c</span></div></div>');
    const a = makePatch({ patchId: 'pA', anchors: { box: fpOf(d, '#box') }, ops: [{ kind: 'hide', target: { anchor: 'box' } }] });
    const b = makePatch({ patchId: 'pB', anchors: { child: fpOf(d, '#child') }, ops: [{ kind: 'setText', target: { anchor: 'child' }, value: 'x' }] });
    const report = analyzeConflicts(d, [a], [b]);
    const editHidden = report.conflicts.find((c) => c.type === 'EDIT_HIDDEN');
    expect(editHidden?.severity).toBe('warning');
    expect(report.blocking).toBe(false);
  });

  it('flags STALE_BASE when a candidate was authored against an older value', () => {
    const d = doc('<div class="wrap"><p id="t">old</p></div>');
    const against = makePatch({ patchId: 'pA', anchors: { t: fpOf(d, '#t') }, ops: [{ kind: 'setText', target: { anchor: 't' }, value: 'new' }] });
    const cand = makePatch({ patchId: 'pB', anchors: { t: fpOf(d, '#t') }, ops: [{ kind: 'setText', target: { anchor: 't' }, value: 'candidate' }], baseValues: { 0: 'old' } });
    const report = analyzeConflicts(d, [against], [cand]);
    expect(report.conflicts.some((c) => c.type === 'STALE_BASE')).toBe(true);
  });
});

describe('analyzeDrift', () => {
  it('marks an unchanged target healthy', () => {
    const d = doc('<div class="wrap"><button id="save" class="btn">Save</button></div>');
    const p = makePatch({ anchors: { a1: fpOf(d, '#save') }, ops: [] });
    const [result] = analyzeDrift(d, [p]);
    expect(result.health).toBe('healthy');
    expect(result.proposedFingerprints).toBeNull();
  });

  it('marks a relocated target healed and proposes fingerprints', () => {
    const before = doc('<div class="wrap"><button id="save" class="btn">Save</button></div>');
    const after = doc('<div class="wrap"><button id="save2" class="btn">Save</button></div>');
    const p = makePatch({ anchors: { a1: fpOf(before, '#save') }, ops: [] });
    const [result] = analyzeDrift(after, [p]);
    expect(result.health).toBe('healed');
    expect(result.proposedFingerprints?.a1.id).toBe('save2');
  });

  it('marks a missing target broken', () => {
    const before = doc('<div class="wrap"><button id="save" class="btn">Save</button></div>');
    const after = doc('<div class="wrap"><p>gone</p></div>');
    const p = makePatch({ anchors: { a1: fpOf(before, '#save') }, ops: [] });
    const [result] = analyzeDrift(after, [p]);
    expect(result.health).toBe('broken');
  });
});

// Strip the cssPath so selector matching cannot trivially succeed.
function replicateWithoutPath<T extends { cssPath: string }>(fp: T): T {
  return { ...fp, cssPath: '' };
}
