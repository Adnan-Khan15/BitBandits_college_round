// apps/server/src/assist/draft.ts (owner: Dev B)
// Page -> compact candidate list for the model; model answer -> real PatchOps and VerificationSteps.
import { AppError, ATTRIBUTE_ALLOWLIST, STYLE_ALLOWLIST } from '@patchwork/shared';
import type { AttributeName, PatchOp, StyleProperty, VerificationStep } from '@patchwork/shared';
import type { Candidate, ModelDraft } from './ollama.js';

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'path', 'head', 'meta', 'link', 'title', 'br', 'hr', 'html', 'body']);
const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'label', 'img']);
const MAX = 120;

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

function ownText(el: Element): string {
  let t = '';
  for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) t += n.textContent ?? '';
  return norm(t);
}

function toCandidate(el: Element, index: number): Candidate {
  return {
    index,
    tag: el.tagName.toLowerCase(),
    text: norm(el.textContent ?? '').slice(0, 80),
    id: el.id || null,
    classes: Array.from(el.classList).slice(0, 3),
    href: el.getAttribute('href'),
    role: el.getAttribute('role'),
  };
}

/** Elements worth naming: interactive ones, ones with their own text, or ones with an id. */
function meaningful(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (SKIP.has(tag) || el.closest('[hidden],[aria-hidden="true"]')) return false;
  return INTERACTIVE.has(tag) || ownText(el) !== '' || el.id !== '';
}

/**
 * The candidate list the model chooses from. With a picked element: that element, its parent,
 * siblings and children; otherwise up to 120 meaningful elements in document order.
 */
export function buildCandidates(doc: Document, pickedElementPath?: string | null): { candidates: Candidate[]; elements: Element[] } {
  let elements: Element[];
  const picked = pickedElementPath ? doc.querySelector(pickedElementPath) : null;
  if (picked) {
    const around = [picked, picked.parentElement, ...Array.from(picked.parentElement?.children ?? []), ...Array.from(picked.children)];
    elements = [...new Set(around.filter((e): e is Element => e !== null && !SKIP.has(e.tagName.toLowerCase())))].slice(0, 20);
  } else {
    elements = Array.from(doc.body?.querySelectorAll('*') ?? []).filter(meaningful).slice(0, MAX);
  }
  return { candidates: elements.map(toCandidate), elements };
}

const isAttr = (n: unknown): n is AttributeName => typeof n === 'string' && (ATTRIBUTE_ALLOWLIST as readonly string[]).includes(n);
const isStyle = (p: unknown): p is StyleProperty => typeof p === 'string' && (STYLE_ALLOWLIST as readonly string[]).includes(p);

/** The model's flat ops/checks -> contract types. Anything incomplete is a plain-language error. */
export function toPatchParts(draft: ModelDraft): { ops: PatchOp[]; checks: VerificationStep[] } {
  const t = { anchor: 'a1' };
  const bad = (what: string): never => {
    throw new AppError('VALIDATION_FAILED', `The model's draft is incomplete: ${what}. Fix it manually, or rephrase.`);
  };
  const ops: PatchOp[] = draft.ops.map((o): PatchOp => {
    switch (o.kind) {
      case 'setText':
        return { kind: 'setText', target: t, value: o.value ?? bad('the new text is missing') };
      case 'setAttribute':
        if (!isAttr(o.name)) bad('the attribute name is missing');
        return { kind: 'setAttribute', target: t, name: o.name as AttributeName, value: o.value ?? '' };
      case 'removeAttribute':
        if (!isAttr(o.name)) bad('the attribute name is missing');
        return { kind: 'removeAttribute', target: t, name: o.name as AttributeName };
      case 'setStyle':
        if (!isStyle(o.property)) bad('the style property is missing');
        return { kind: 'setStyle', target: t, property: o.property as StyleProperty, value: o.value ?? bad('the style value is missing') };
      case 'hide':
        return { kind: 'hide', target: t };
      case 'show':
        return { kind: 'show', target: t };
      case 'insertHTML':
        return { kind: 'insertHTML', target: t, position: o.position ?? 'afterend', html: o.html ?? o.value ?? bad('the note text is missing') };
      case 'setBehavior':
        if (o.behavior === 'preventDefault') {
          return { kind: 'setBehavior', target: t, event: 'click', mode: 'replace', action: { type: 'preventDefault' } };
        }
        return {
          kind: 'setBehavior',
          target: t,
          event: 'click',
          mode: 'replace',
          // small models sometimes put the destination in another text field; it is still their answer
          action: { type: 'navigate', url: o.url ?? o.value ?? o.html ?? bad('the page to go to is missing') },
        };
      default:
        return bad(`“${String((o as { kind?: unknown }).kind)}” is not an operation PATCHWORK supports`);
    }
  });
  const checks: VerificationStep[] = [];
  for (const c of draft.checks ?? []) {
    if (c.action === 'click') checks.push({ action: 'click', target: 'anchor:a1' });
    else if (c.action === 'expectUrl' && c.contains) checks.push({ action: 'expectUrl', contains: c.contains });
    else if (c.action === 'expectText' && c.contains) checks.push({ action: 'expectText', target: 'anchor:a1', contains: c.contains });
    else if (c.action === 'expectVisible') checks.push({ action: 'expectVisible', target: 'anchor:a1' });
    else if (c.action === 'expectHidden') checks.push({ action: 'expectHidden', target: 'anchor:a1' });
  }
  return { ops, checks };
}
