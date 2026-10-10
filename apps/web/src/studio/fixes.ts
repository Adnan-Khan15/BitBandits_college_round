// apps/web/src/studio/fixes.ts (owner: Dev D)
// Plain-language fixes -> the 9 patch operations, suggested checks and a readable title.
import type { AttributeName, ElementFingerprint, PatchOp, StyleProperty, VerificationStep } from '@patchwork/shared';

export interface Picked {
  fingerprint: ElementFingerprint;
  elementPath: string;
  current: { text: string; attrs: Record<string, string>; styles: Record<string, string> };
  path: string;
}

export type FixKind = 'text' | 'style' | 'hide' | 'show' | 'attr' | 'click' | 'move' | 'insert';

export const FIX_CHOICES: Array<{ kind: FixKind; label: string; hint: string }> = [
  { kind: 'click', label: 'Make it do something when clicked', hint: 'Go to a page, or stop a broken click' },
  { kind: 'text', label: 'Change the text', hint: 'Fix a typo, a price or a label' },
  { kind: 'style', label: 'Restyle it', hint: 'Colour, size, spacing, bold' },
  { kind: 'hide', label: 'Hide it', hint: 'Remove an expired banner or a broken widget' },
  { kind: 'show', label: 'Show it', hint: 'Bring back something hidden' },
  { kind: 'attr', label: 'Change a link or attribute', hint: 'Link target, title, label, alt text' },
  { kind: 'move', label: 'Move it', hint: 'Put it before or after another element' },
  { kind: 'insert', label: 'Add a note or banner', hint: 'A short message next to it' },
];

export const STYLE_PRESETS: Array<{ property: StyleProperty; label: string; placeholder: string }> = [
  { property: 'color', label: 'Text colour', placeholder: '#0f7b5f' },
  { property: 'background-color', label: 'Background colour', placeholder: '#fff7d6' },
  { property: 'font-size', label: 'Text size', placeholder: '18px' },
  { property: 'font-weight', label: 'Boldness', placeholder: '700' },
  { property: 'padding', label: 'Inner spacing', placeholder: '12px 20px' },
  { property: 'margin', label: 'Outer spacing', placeholder: '16px 0' },
  { property: 'opacity', label: 'See-through', placeholder: '0.6' },
  { property: 'pointer-events', label: 'Clickable', placeholder: 'none' },
];

export const ATTR_CHOICES: AttributeName[] = ['href', 'title', 'aria-label', 'alt', 'placeholder', 'target', 'disabled'];

export interface FixForm {
  kind: FixKind | null;
  text: string;
  styleProperty: StyleProperty;
  styleValue: string;
  attrName: AttributeName;
  attrValue: string;
  attrRemove: boolean;
  clickAction: 'navigate' | 'block';
  clickUrl: string;
  moveRef: Picked | null;
  movePosition: 'before' | 'after' | 'prepend' | 'append';
  insertText: string;
  insertPosition: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';
}

export function emptyForm(): FixForm {
  return {
    kind: null,
    text: '',
    styleProperty: 'color',
    styleValue: '',
    attrName: 'href',
    attrValue: '',
    attrRemove: false,
    clickAction: 'navigate',
    clickUrl: '/checkout',
    moveRef: null,
    movePosition: 'after',
    insertText: '',
    insertPosition: 'afterend',
  };
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The operations for this fix, or null while the form is incomplete. */
export function opsFor(form: FixForm): PatchOp[] | null {
  const t = { anchor: 'a1' };
  switch (form.kind) {
    case 'text':
      return [{ kind: 'setText', target: t, value: form.text }];
    case 'style':
      return form.styleValue.trim() ? [{ kind: 'setStyle', target: t, property: form.styleProperty, value: form.styleValue.trim() }] : null;
    case 'hide':
      return [{ kind: 'hide', target: t }];
    case 'show':
      return [{ kind: 'show', target: t }];
    case 'attr':
      if (form.attrRemove) return [{ kind: 'removeAttribute', target: t, name: form.attrName }];
      return [{ kind: 'setAttribute', target: t, name: form.attrName, value: form.attrValue }];
    case 'click':
      if (form.clickAction === 'block') {
        return [{ kind: 'setBehavior', target: t, event: 'click', mode: 'replace', action: { type: 'preventDefault' } }];
      }
      return form.clickUrl.trim()
        ? [{ kind: 'setBehavior', target: t, event: 'click', mode: 'replace', action: { type: 'navigate', url: form.clickUrl.trim() } }]
        : null;
    case 'move':
      return form.moveRef ? [{ kind: 'move', target: t, reference: { anchor: 'a2' }, position: form.movePosition }] : null;
    case 'insert':
      return form.insertText.trim()
        ? [{ kind: 'insertHTML', target: t, position: form.insertPosition, html: `<p class="pw-note">${escapeHtml(form.insertText.trim())}</p>` }]
        : null;
    default:
      return null;
  }
}

/** Checks suggested from the fix: what a real browser should see once it is applied. */
export function suggestedChecks(form: FixForm): VerificationStep[] {
  switch (form.kind) {
    case 'click':
      return form.clickAction === 'navigate' && form.clickUrl.trim()
        ? [
            { action: 'click', target: 'anchor:a1' },
            { action: 'expectUrl', contains: form.clickUrl.trim() },
          ]
        : [];
    case 'text':
      return form.text.trim() ? [{ action: 'expectText', target: 'anchor:a1', contains: form.text.trim() }] : [];
    case 'hide':
      return [{ action: 'expectHidden', target: 'anchor:a1' }];
    case 'show':
      return [{ action: 'expectVisible', target: 'anchor:a1' }];
    default:
      return [];
  }
}

export function labelOf(p: Picked | null): string {
  if (!p) return 'it';
  const text = p.current.text || p.fingerprint.accessibleName || '';
  return text ? `“${text.length > 40 ? `${text.slice(0, 40)}…` : text}”` : `the ${p.fingerprint.tag}`;
}

/** A readable title, e.g. Make “Proceed to checkout” go to /checkout. */
export function titleFor(form: FixForm, picked: Picked | null): string {
  const it = labelOf(picked);
  switch (form.kind) {
    case 'text':
      return `Change ${it} to “${form.text}”`;
    case 'style':
      return `Restyle ${it}`;
    case 'hide':
      return `Hide ${it}`;
    case 'show':
      return `Show ${it}`;
    case 'attr':
      return form.attrRemove ? `Remove ${form.attrName} from ${it}` : `Set ${form.attrName} of ${it}`;
    case 'click':
      return form.clickAction === 'block' ? `Stop ${it} doing anything on click` : `Make ${it} go to ${form.clickUrl}`;
    case 'move':
      return `Move ${it}`;
    case 'insert':
      return `Add a note next to ${it}`;
    default:
      return '';
  }
}

export function stepText(step: VerificationStep): string {
  const target = (t: string) => (t === 'anchor:a1' ? 'the picked element' : t.startsWith('anchor:') ? 'the changed element' : t);
  switch (step.action) {
    case 'goto':
      return `Open ${step.path}`;
    case 'click':
      return `Click ${target(step.target)}`;
    case 'fill':
      return `Type “${step.value}” into ${target(step.target)}`;
    case 'expectText':
      return `${target(step.target)} shows “${step.contains}”`;
    case 'expectVisible':
      return `${target(step.target)} is visible`;
    case 'expectHidden':
      return `${target(step.target)} is hidden`;
    case 'expectUrl':
      return `The page address contains ${step.contains}`;
  }
}
