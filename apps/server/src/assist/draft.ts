// apps/server/src/assist/draft.ts (owner: Dev B)
// Page -> candidate list for the model; model answer -> a grounded, validated patch body.
// Grounding: every change must quote the element's current text; the server checks the quote
// against the real page (and finds the element that really shows it when the index is off),
// does percentage arithmetic itself, and derives the browser checks from the real changes.
import { AppError, ATTRIBUTE_ALLOWLIST, LIMITS, STYLE_ALLOWLIST } from '@patchwork/shared';
import type { AttributeName, ElementFingerprint, PatchOp, StyleProperty, VerificationStep } from '@patchwork/shared';
import { captureFingerprint } from '@patchwork/engine';
import type { Candidate, ModelDraft } from './ollama.js';

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'path', 'head', 'meta', 'link', 'title', 'br', 'hr', 'html', 'body']);
const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'label', 'img']);
const MAX = 150;

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const key = (s: string): string => norm(s).toLowerCase();

function ownText(el: Element): string {
  let t = '';
  for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) t += n.textContent ?? '';
  return norm(t);
}

/** Where an element sits: its table row's first cell, or the heading of its card / list item / section. */
function contextOf(el: Element): string | null {
  const own = key(el.textContent ?? '');
  const row = el.closest('tr');
  if (row) {
    const first = norm(row.querySelector('td, th')?.textContent ?? '');
    if (first && key(first) !== own) return first.slice(0, 40);
  }
  const box = el.closest('article, li, section, [class*="card"], [class*="product"], [class*="item"]');
  if (box) {
    const heading = norm(box.querySelector('h1, h2, h3, h4, h5, h6, strong')?.textContent ?? '');
    if (heading && key(heading) !== own) return heading.slice(0, 40);
  }
  return null;
}

/** A link to the same site is shown as its path (/book), so the model never sends people off-site. */
function hrefOf(el: Element): string | null {
  const raw = el.getAttribute('href');
  if (!raw) return null;
  try {
    const base = el.ownerDocument?.URL ?? '';
    const u = new URL(raw, base);
    return base && u.origin === new URL(base).origin ? `${u.pathname}${u.search}${u.hash}` : raw;
  } catch {
    return raw;
  }
}

function toCandidate(el: Element, index: number): Candidate {
  return {
    index,
    tag: el.tagName.toLowerCase(),
    text: norm(el.textContent ?? '').slice(0, 80),
    id: el.id || null,
    classes: Array.from(el.classList).slice(0, 3),
    href: hrefOf(el),
    role: el.getAttribute('role'),
    context: contextOf(el),
  };
}

/** Elements worth naming: interactive ones, ones with their own text, or ones with an id. */
function meaningful(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (SKIP.has(tag) || el.closest('[hidden],[aria-hidden="true"],template,noscript')) return false;
  return INTERACTIVE.has(tag) || ownText(el) !== '' || el.id !== '';
}

/**
 * The candidate list the model chooses from. With a picked element: that element, its parent,
 * siblings and children first, then the rest of the page; otherwise up to 150 meaningful elements.
 */
export function buildCandidates(doc: Document, pickedElementPath?: string | null): { candidates: Candidate[]; elements: Element[] } {
  const all = Array.from(doc.body?.querySelectorAll('*') ?? []).filter(meaningful);
  const picked = pickedElementPath ? doc.querySelector(pickedElementPath) : null;
  let elements = all;
  if (picked) {
    const near = [picked, picked.parentElement, ...Array.from(picked.parentElement?.children ?? []), ...Array.from(picked.children)]
      .filter((e): e is Element => e !== null && !SKIP.has(e.tagName.toLowerCase()));
    elements = [...new Set([...near, ...all])];
  }
  elements = elements.slice(0, MAX);
  return { candidates: elements.map(toCandidate), elements };
}

const isAttr = (n: unknown): n is AttributeName => typeof n === 'string' && (ATTRIBUTE_ALLOWLIST as readonly string[]).includes(n);
const isStyle = (p: unknown): p is StyleProperty => typeof p === 'string' && (STYLE_ALLOWLIST as readonly string[]).includes(p);

/** "₹2,499" x 0.9 -> "₹2,249": the first number in the text, same prefix/suffix, same grouping style. */
export function scaleText(text: string, factor: number): string | null {
  const m = /^([\s\S]*?)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/.exec(text.trim());
  if (!m) return null;
  const raw = m[2]!;
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const decimals = raw.includes('.') ? (raw.split('.')[1]?.length ?? 0) : 0;
  const value = Math.round(n * factor * 10 ** decimals) / 10 ** decimals;
  const useGrouping = raw.includes(',') || value >= 10000;
  const formatted = useGrouping
    ? value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : value.toFixed(decimals);
  return `${m[1]}${formatted}${m[3]}`;
}

export interface Grounded {
  anchors: Record<string, ElementFingerprint>;
  ops: PatchOp[];
  checks: VerificationStep[];
  baseValues: Record<number, string | null>;
  /** One line per element changed, for the person reviewing the draft. */
  changes: Array<{ element: string; change: string }>;
  notes: string[];
  /** How many changes named the wrong index and were matched by their quoted text. */
  corrected: number;
}

const PRICE_WORDS = /price|cost|discount|cheaper|expensive|sale|%|₹|\$|€|£|rupee|charge|total/i;

/**
 * Turns the model's answer into a patch body grounded in the real page. Throws AppError
 * (VALIDATION_FAILED) with a precise reason, which the caller feeds back to the model once.
 */
/** Same-site pages the page links to, for telling the model which pages exist. */
export function sitePaths(candidates: Candidate[]): string[] {
  return [...new Set(candidates.map((c) => c.href).filter((h): h is string => !!h && h.startsWith('/') && !h.startsWith('//')))].slice(0, 20);
}

export function groundDraft(
  draft: ModelDraft,
  instruction: string,
  candidates: Candidate[],
  elements: Element[],
  domHash: string,
  pageUrl?: string,
): Grounded {
  const fail = (why: string): never => {
    throw new AppError('VALIDATION_FAILED', why);
  };
  const quoteMatches = (c: Candidate, quoted: string): boolean => {
    const a = key(c.text);
    const b = key(quoted);
    if (!b) return a === '';
    return a === b || (b.length >= 3 && (a.includes(b) || b.includes(a) && a.length >= 3));
  };
  /** The element the op means: its index when the quote fits, else the element that really shows the quote. */
  const resolve = (op: ModelDraft['ops'][number], i: number): number => {
    const quoted = op.currentText ?? '';
    const byIndex = candidates[op.target];
    if (byIndex && quoteMatches(byIndex, quoted)) return op.target;
    const exact = candidates.filter((c) => key(c.text) === key(quoted) && key(quoted) !== '');
    const loose = exact.length ? exact : candidates.filter((c) => quoteMatches(c, quoted) && key(quoted).length >= 3);
    // the most specific element that shows those words (shortest text), in page order
    const best = loose.sort((x, y) => x.text.length - y.text.length || x.index - y.index)[0];
    if (best) return best.index;
    return fail(
      `Change ${i + 1} quoted “${quoted}” but element [${op.target}] shows “${byIndex?.text ?? 'nothing'}”, and no element on the page shows “${quoted}”. Use an element from the list and copy its text exactly.`,
    );
  };

  const anchorFor = new Map<number, string>();
  const anchors: Record<string, ElementFingerprint> = {};
  const anchorOf = (index: number): string => {
    const existing = anchorFor.get(index);
    if (existing) return existing;
    if (anchorFor.size >= LIMITS.anchorsPerPatch.max) {
      fail(`This would change more than ${LIMITS.anchorsPerPatch.max} elements. Narrow the instruction to one part of the page.`);
    }
    const k = `a${anchorFor.size + 1}`;
    anchorFor.set(index, k);
    anchors[k] = captureFingerprint(elements[index]!, { capturedFromHash: domHash });
    return k;
  };

  const ops: PatchOp[] = [];
  const baseValues: Record<number, string | null> = {};
  const changes: Grounded['changes'] = [];
  const textChecks: VerificationStep[] = [];
  let navCheck: VerificationStep[] = [];
  let corrected = 0;
  let touchedNumbers = false;

  draft.ops.forEach((o, i) => {
    const index = resolve(o, i);
    if (index !== o.target) corrected++;
    const c = candidates[index]!;
    const target = { anchor: anchorOf(index) };
    const label = c.text ? `“${c.text.slice(0, 40)}”${c.context ? ` (${c.context})` : ''}` : `the ${c.tag}`;
    switch (o.kind) {
      case 'setText': {
        const value = o.value ?? fail(`Change ${i + 1} (setText) has no new text.`);
        baseValues[ops.length] = c.text;
        ops.push({ kind: 'setText', target, value });
        textChecks.push({ action: 'expectText', target: `anchor:${target.anchor}`, contains: value });
        changes.push({ element: label, change: `text becomes “${value}”` });
        if (/\d/.test(c.text) || /\d/.test(value)) touchedNumbers = true;
        break;
      }
      case 'scaleNumber': {
        const factor = o.factor;
        if (typeof factor !== 'number' || !(factor > 0 && factor < 10)) fail(`Change ${i + 1} (scaleNumber) needs a factor such as 0.9.`);
        const value = scaleText(c.text, factor as number) ?? fail(`Change ${i + 1}: “${c.text}” has no number to scale.`);
        baseValues[ops.length] = c.text;
        ops.push({ kind: 'setText', target, value });
        textChecks.push({ action: 'expectText', target: `anchor:${target.anchor}`, contains: value });
        changes.push({ element: label, change: `${c.text} → ${value}` });
        touchedNumbers = true;
        break;
      }
      case 'navigate': {
        let url = o.url ?? o.value ?? o.html ?? fail(`Change ${i + 1} (navigate) has no page to go to.`);
        try {
          // a full address on this same site becomes a path, so the visitor stays on the patched site
          if (pageUrl && /^https?:\/\//i.test(url) && new URL(url).origin === new URL(pageUrl).origin) {
            const u = new URL(url);
            url = `${u.pathname}${u.search}${u.hash}`;
          }
        } catch {
          /* not a URL: the patch validator decides */
        }
        ops.push({ kind: 'setBehavior', target, event: 'click', mode: 'replace', action: { type: 'navigate', url } });
        navCheck = [
          { action: 'click', target: `anchor:${target.anchor}` },
          { action: 'expectUrl', contains: url },
        ];
        changes.push({ element: label, change: `clicking goes to ${url}` });
        break;
      }
      case 'blockClick':
        ops.push({ kind: 'setBehavior', target, event: 'click', mode: 'replace', action: { type: 'preventDefault' } });
        changes.push({ element: label, change: 'clicking does nothing' });
        break;
      case 'hide':
        ops.push({ kind: 'hide', target });
        textChecks.push({ action: 'expectHidden', target: `anchor:${target.anchor}` });
        changes.push({ element: label, change: 'hidden' });
        break;
      case 'show':
        ops.push({ kind: 'show', target });
        textChecks.push({ action: 'expectVisible', target: `anchor:${target.anchor}` });
        changes.push({ element: label, change: 'shown' });
        break;
      case 'setStyle':
        if (!isStyle(o.property)) fail(`Change ${i + 1} (setStyle) needs a style property.`);
        ops.push({ kind: 'setStyle', target, property: o.property as StyleProperty, value: o.value ?? fail(`Change ${i + 1} (setStyle) has no value.`) });
        changes.push({ element: label, change: `${o.property} becomes ${o.value}` });
        break;
      case 'setAttribute':
        if (!isAttr(o.name)) fail(`Change ${i + 1} (setAttribute) needs an attribute name.`);
        ops.push({ kind: 'setAttribute', target, name: o.name as AttributeName, value: o.value ?? '' });
        changes.push({ element: label, change: `${o.name} becomes “${o.value ?? ''}”` });
        break;
      case 'removeAttribute':
        if (!isAttr(o.name)) fail(`Change ${i + 1} (removeAttribute) needs an attribute name.`);
        ops.push({ kind: 'removeAttribute', target, name: o.name as AttributeName });
        changes.push({ element: label, change: `${o.name} removed` });
        break;
      case 'insertHTML':
        ops.push({
          kind: 'insertHTML',
          target,
          position: o.position ?? 'afterend',
          html: o.html ?? o.value ?? fail(`Change ${i + 1} (insertHTML) has no note text.`),
        });
        changes.push({ element: label, change: 'a note is added next to it' });
        break;
      default:
        fail(`Change ${i + 1}: “${String((o as { kind?: unknown }).kind)}” is not a change PATCHWORK supports.`);
    }
  });

  // checks prove the real changes; a navigation ends the page, so it runs last
  const checks = [...textChecks, ...navCheck].slice(0, LIMITS.checksPerPatch.max);
  const notes: string[] = [];
  if (touchedNumbers && PRICE_WORDS.test(instruction)) {
    notes.push(
      'This changes the prices shown on the page. What the shop actually charges, and totals its own code calculates, still come from the shop.',
    );
  }
  if (corrected > 0) {
    notes.push(`${corrected} change${corrected === 1 ? '' : 's'} pointed at the wrong element; PATCHWORK matched ${corrected === 1 ? 'it' : 'them'} to the element that really shows the quoted text.`);
  }
  return { anchors, ops, checks, baseValues, changes, notes, corrected };
}
