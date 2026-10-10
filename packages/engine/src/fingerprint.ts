// packages/engine/src/fingerprint.ts
// Capture element fingerprints for resolver matching.
// Browser-safe: no Node imports.

import type { ElementFingerprint, Rect } from '@patchwork/shared';
import { LIMITS } from '@patchwork/shared';

const MAX_TEXT_LEN = LIMITS.fingerprintTextMaxLength;
const MAX_ANCESTORS = LIMITS.ancestorsMax;

// CSS.escape is a browser global; fall back for Node/jsdom (benchmark + tests).
const cssEscape: (value: string) => string =
  typeof globalThis.CSS !== 'undefined' && typeof globalThis.CSS.escape === 'function'
    ? (value) => globalThis.CSS.escape(value)
    : (value) => value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);

function normaliseText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LEN);
}

function getAccessibleName(el: Element): string | null {
  // aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return normaliseText(ariaLabel);

  // aria-labelledby
  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const refEl = el.ownerDocument?.getElementById(ariaLabelledBy);
    if (refEl) return normaliseText(refEl.textContent || '');
  }

  // label[for]
  const id = el.getAttribute('id');
  if (id) {
    const label = el.ownerDocument?.querySelector(`label[for="${id}"]`);
    if (label) return normaliseText(label.textContent || '');
  }

  // alt
  const alt = el.getAttribute('alt');
  if (alt) return normaliseText(alt);

  // title
  const title = el.getAttribute('title');
  if (title) return normaliseText(title);

  return null;
}

function getImplicitRole(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  const type = el.getAttribute('type')?.toLowerCase();

  if (tag === 'a' && el.hasAttribute('href')) return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'input' && (type === 'submit' || type === 'button' || type === 'image')) return 'button';
  if (tag === 'input' && (type === 'text' || type === 'email' || type === 'password' || type === 'search' || type === 'tel' || type === 'url' || !type)) return 'textbox';
  if (tag === 'select') return 'combobox';
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return 'heading';
  if (tag === 'img') return 'img';
  return null;
}

function getAllowlistedAttrs(el: Element): Record<string, string> {
  const allowed = ['href', 'src', 'alt', 'title', 'type', 'placeholder', 'value'];
  const attrs: Record<string, string> = {};
  for (const name of allowed) {
    const value = el.getAttribute(name);
    if (value !== null) attrs[name] = value;
  }
  return attrs;
}

function getAncestors(el: Element): Array<{ tag: string; id: string | null; classes: string[] }> {
  const result: Array<{ tag: string; id: string | null; classes: string[] }> = [];
  let current: Element | null = el.parentElement;
  while (current && result.length < MAX_ANCESTORS) {
    result.push({
      tag: current.tagName.toLowerCase(),
      id: current.id || null,
      classes: Array.from(current.classList),
    });
    current = current.parentElement;
  }
  return result;
}

function getSiblingIndex(el: Element): number {
  let index = 0;
  let sibling: Element | null = el.previousElementSibling;
  while (sibling) {
    index++;
    sibling = sibling.previousElementSibling;
  }
  return index;
}

function getNeighborText(el: Element): string {
  const parts: string[] = [];

  const prev = el.previousElementSibling;
  if (prev) parts.push(normaliseText(prev.textContent || ''));

  const next = el.nextElementSibling;
  if (next) parts.push(normaliseText(next.textContent || ''));

  const parentLabel = el.parentElement?.getAttribute('aria-label') || el.parentElement?.getAttribute('title');
  if (parentLabel) parts.push(normaliseText(parentLabel));

  return parts.join(' ').slice(0, MAX_TEXT_LEN);
}

function looksGeneratedId(id: string): boolean {
  // 4+ digits or hex-like (e.g., "abc123", "item-42", "react-12345")
  if (/\d{4,}/.test(id)) return true;
  if (/^[0-9a-f]{8,}$/i.test(id)) return true;
  if (/^(react|vue|ng|ember|svelte|auto|generated|temp|tmp)-/i.test(id)) return true;
  return false;
}

function buildCssPath(el: Element): string {
  // Try unique #id first (unless generated)
  if (el.id && !looksGeneratedId(el.id)) {
    const candidate = `#${cssEscape(el.id)}`;
    if (el.ownerDocument?.querySelectorAll(candidate).length === 1) return candidate;
  }

  // Try unique [data-testid]
  const testId = el.getAttribute('data-testid');
  if (testId) {
    const candidate = `[data-testid="${cssEscape(testId)}"]`;
    if (el.ownerDocument?.querySelectorAll(candidate).length === 1) return candidate;
  }

  // Build tag.class:nth-of-type chain
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== current.ownerDocument?.body) {
    const tag = current.tagName.toLowerCase();
    const classPart = Array.from(current.classList).map(c => `.${cssEscape(c)}`).join('');
    let selector = `${tag}${classPart}`;

    // Add :nth-of-type if needed for uniqueness among siblings
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children) as Element[];
      const sameTag = siblings.filter(c => c.tagName.toLowerCase() === tag);
      if (sameTag.length > 1) {
        const index = sameTag.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    current = parent;
  }

  return parts.join(' > ');
}

function getAbsoluteXPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current.nodeType === 1) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children) as Element[];
      const sameTag = siblings.filter(c => c.tagName.toLowerCase() === tag);
      if (sameTag.length > 1) {
        const index = sameTag.indexOf(current) + 1;
        parts.unshift(`${tag}[${index}]`);
        current = parent;
        continue;
      }
    }
    parts.unshift(tag);
    current = parent;
  }
  return '/' + parts.join('/');
}

function getRect(el: Element, withRect: boolean): Rect | null {
  if (!withRect) return null;
  const rect = el.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function captureFingerprint(
  el: Element,
  opts?: { withRect?: boolean; capturedFromHash?: string },
): ElementFingerprint {
  const tag = el.tagName.toLowerCase();
  const id = el.id || null;
  const testId = el.getAttribute('data-testid') || null;
  const name = el.getAttribute('name') || null;
  const classes = Array.from(el.classList);
  const text = normaliseText(el.textContent || '');
  const accessibleName = getAccessibleName(el);
  const role = getImplicitRole(el);
  const attrs = getAllowlistedAttrs(el);
  const cssPath = buildCssPath(el);
  const xpath = getAbsoluteXPath(el);
  const ancestors = getAncestors(el);
  const siblingIndex = getSiblingIndex(el);
  const neighborText = getNeighborText(el);
  const rect = getRect(el, opts?.withRect ?? false);

  return {
    v: 1,
    tag,
    id,
    testId,
    name,
    classes,
    text,
    accessibleName,
    role,
    attrs,
    cssPath,
    xpath,
    ancestors,
    siblingIndex,
    neighborText,
    rect,
    capturedAt: new Date().toISOString(),
    capturedFromHash: opts?.capturedFromHash || 'runtime',
  };
}

export function uniqueCssPath(el: Element): string {
  return buildCssPath(el);
}