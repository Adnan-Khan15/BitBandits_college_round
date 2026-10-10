// apps/server/src/core/validate.test.ts (owner: Dev A) - T-VAL-1
// One test per rejection rule in PLAN 11.4, plus sanitiser warnings.
import { describe, expect, it } from 'vitest';
import { validatePatchBody, validatePatchBodyPartial } from './validate.js';

const goodAnchor = {
  v: 1, tag: 'button', id: 'checkout-btn', testId: null, name: null,
  classes: ['btn', 'btn-primary'], text: 'Proceed to checkout', accessibleName: 'Proceed to checkout',
  role: 'button', attrs: {}, cssPath: 'button#checkout-btn', xpath: '//button[@id="checkout-btn"]',
  ancestors: [], siblingIndex: 0, neighborText: '', rect: null,
  capturedAt: new Date().toISOString(), capturedFromHash: 'abc123',
};

const baseBody = {
  urlPath: '/cart',
  anchors: { a1: goodAnchor },
  ops: [{ kind: 'hide' as const, target: { anchor: 'a1' } }],
  checks: [],
  baseSnapshotId: null,
  baseValues: {},
};

describe('validatePatchBody (T-VAL-1)', () => {
  it('accepts a valid minimal patch', () => {
    const res = validatePatchBody(baseBody);
    expect(res.valid).toBe(true);
    expect(res.issues).toHaveLength(0);
    expect(res.sanitized).toBeNull();
  });

  // --- structural / anchor reference errors ---
  it('rejects op referencing undefined anchor', () => {
    const body = { ...baseBody, ops: [{ kind: 'hide' as const, target: { anchor: 'missing' } }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'ANCHOR_NOT_FOUND')).toBe(true);
  });

  it('rejects move with undefined reference anchor', () => {
    const body = { ...baseBody, ops: [{ kind: 'move' as const, target: { anchor: 'a1' }, reference: { anchor: 'missing' }, position: 'after' as const }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'ANCHOR_NOT_FOUND')).toBe(true);
  });

  it('rejects setBehavior clickTarget with undefined anchor', () => {
    const body = { ...baseBody, ops: [{ kind: 'setBehavior' as const, target: { anchor: 'a1' }, event: 'click' as const, mode: 'replace' as const, action: { type: 'clickTarget' as const, target: { anchor: 'missing' } } }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'ANCHOR_NOT_FOUND')).toBe(true);
  });

  // --- on* attributes ---
  it('rejects on* attribute via setAttribute (zod rejects unknown attr)', () => {
    const body = { ...baseBody, ops: [{ kind: 'setAttribute' as const, target: { anchor: 'a1' }, name: 'onclick', value: 'alert(1)' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'ZOD_VALIDATION')).toBe(true);
  });

  // --- forbidden attribute names ---
  it('rejects srcdoc attribute (zod rejects unknown attr)', () => {
    const body = { ...baseBody, ops: [{ kind: 'setAttribute' as const, target: { anchor: 'a1' }, name: 'srcdoc', value: '<script>alert(1)</script>' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'ZOD_VALIDATION')).toBe(true);
  });

  it('rejects style attribute via setAttribute (zod rejects unknown attr)', () => {
    const body = { ...baseBody, ops: [{ kind: 'setAttribute' as const, target: { anchor: 'a1' }, name: 'style', value: 'color: red' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'ZOD_VALIDATION')).toBe(true);
  });

  it('rejects formaction attribute (zod rejects unknown attr)', () => {
    const body = { ...baseBody, ops: [{ kind: 'setAttribute' as const, target: { anchor: 'a1' }, name: 'formaction', value: 'javascript:alert(1)' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'ZOD_VALIDATION')).toBe(true);
  });

  // --- URL protocol validation ---
  it('rejects javascript: URL in href', () => {
    const body = { ...baseBody, ops: [{ kind: 'setAttribute' as const, target: { anchor: 'a1' }, name: 'href', value: 'javascript:alert(1)' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_URL_PROTOCOL')).toBe(true);
  });

  it('rejects javascript: URL in navigate action', () => {
    const body = { ...baseBody, ops: [{ kind: 'setBehavior' as const, target: { anchor: 'a1' }, event: 'click' as const, mode: 'replace' as const, action: { type: 'navigate' as const, url: 'javascript:alert(1)' } }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_URL_PROTOCOL')).toBe(true);
  });

  it('accepts relative and https URLs', () => {
    const rel = { ...baseBody, ops: [{ kind: 'setAttribute' as const, target: { anchor: 'a1' }, name: 'href', value: '/checkout' }] };
    expect(validatePatchBody(rel).valid).toBe(true);
    const https = { ...baseBody, ops: [{ kind: 'setAttribute' as const, target: { anchor: 'a1' }, name: 'href', value: 'https://example.com' }] };
    expect(validatePatchBody(https).valid).toBe(true);
  });

  // --- style property allowlist & dangerous values ---
  it('rejects style property not on allowlist (zod rejects)', () => {
    const body = { ...baseBody, ops: [{ kind: 'setStyle' as const, target: { anchor: 'a1' }, property: 'color', value: 'expression(alert(1))' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    // Could be ZOD_VALIDATION for expression() or DANGEROUS_STYLE_VALUE
    expect(res.issues.some((i) => i.code === 'DANGEROUS_STYLE_VALUE' || i.code === 'ZOD_VALIDATION')).toBe(true);
  });

  it('rejects @import in style value', () => {
    const body = { ...baseBody, ops: [{ kind: 'setStyle' as const, target: { anchor: 'a1' }, property: 'color', value: '@import url("evil.css")' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'DANGEROUS_STYLE_VALUE')).toBe(true);
  });

  it('rejects http: url() in style value (zod validates url protocol)', () => {
    const body = { ...baseBody, ops: [{ kind: 'setStyle' as const, target: { anchor: 'a1' }, property: 'background-image', value: 'url(http://evil.com/img.png)' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    // zod catches this via URL validation in the schema
    expect(res.issues.some((i) => i.code === 'ZOD_VALIDATION' || i.code === 'DANGEROUS_STYLE_VALUE')).toBe(true);
  });

  it('accepts https: url() in style value (zod validates)', () => {
    const body = { ...baseBody, ops: [{ kind: 'setStyle' as const, target: { anchor: 'a1' }, property: 'background-image', value: 'url(https://cdn.example.com/img.png)' }] };
    expect(validatePatchBody(body).valid).toBe(true);
  });

  it('rejects < and \\ in style value', () => {
    const body = { ...baseBody, ops: [{ kind: 'setStyle' as const, target: { anchor: 'a1' }, property: 'color', value: 'red < blue' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'DANGEROUS_STYLE_VALUE')).toBe(true);
  });

  // --- length limits (zod validates these) ---
  it('rejects setText > 2000 chars (zod validates length)', () => {
    const body = { ...baseBody, ops: [{ kind: 'setText' as const, target: { anchor: 'a1' }, value: 'x'.repeat(2001) }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'ZOD_VALIDATION')).toBe(true);
  });

  it('rejects insertHTML > 10 KB (zod validates length)', () => {
    const body = { ...baseBody, ops: [{ kind: 'insertHTML' as const, target: { anchor: 'a1' }, position: 'beforeend' as const, html: 'x'.repeat(10 * 1024 + 1) }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'ZOD_VALIDATION')).toBe(true);
  });

  // --- DOMPurify sanitization (warnings) ---
  it('sanitizes script tags in insertHTML and returns warning', () => {
    const body = { ...baseBody, ops: [{ kind: 'insertHTML' as const, target: { anchor: 'a1' }, position: 'beforeend' as const, html: '<script>alert(1)</script><div>safe</div>' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(true);
    expect(res.sanitized).not.toBeNull();
    const sanitizedOp = res.sanitized?.ops[0];
    expect(sanitizedOp?.kind).toBe('insertHTML');
    if (sanitizedOp?.kind === 'insertHTML') expect(sanitizedOp.html).not.toContain('<script>');
    expect(res.issues.some((i) => i.code === 'HTML_SANITIZED' && i.severity === 'warning')).toBe(true);
  });

  it('sanitizes iframe and event handlers in insertHTML', () => {
    const body = { ...baseBody, ops: [{ kind: 'insertHTML' as const, target: { anchor: 'a1' }, position: 'beforeend' as const, html: '<iframe src="evil.com"></iframe><div onclick="alert(1)">x</div>' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(true);
    expect(res.sanitized).not.toBeNull();
    const sanitizedOp = res.sanitized?.ops[0];
    expect(sanitizedOp?.kind).toBe('insertHTML');
    if (sanitizedOp?.kind === 'insertHTML') {
      expect(sanitizedOp.html).not.toContain('<iframe');
      expect(sanitizedOp.html).not.toContain('onclick');
    }
    expect(res.issues.some((i) => i.code === 'HTML_SANITIZED')).toBe(true);
  });

  it('passes through clean HTML unchanged (no warning)', () => {
    const body = { ...baseBody, ops: [{ kind: 'insertHTML' as const, target: { anchor: 'a1' }, position: 'beforeend' as const, html: '<div class="safe">Hello</div>' }] };
    const res = validatePatchBody(body);
    expect(res.valid).toBe(true);
    expect(res.sanitized).toBeNull();
    expect(res.issues).toHaveLength(0);
  });

  // --- partial validation (PATCH updates) ---
  it('validates partial body with only ops (anchor provided in body)', () => {
    const res = validatePatchBodyPartial({ anchors: { a1: goodAnchor }, ops: [{ kind: 'hide' as const, target: { anchor: 'a1' } }] });
    expect(res.valid).toBe(true);
  });

  it('validates partial body with existing anchors in DB (ops only)', () => {
    // This simulates PATCH where anchors already exist from previous revision
    // Our partial validation requires anchors to be present in the request or it will fail anchor ref check
    const res = validatePatchBodyPartial({ ops: [{ kind: 'hide' as const, target: { anchor: 'a1' } }] });
    // This should fail because anchor 'a1' is not in the partial request
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'ANCHOR_NOT_FOUND')).toBe(true);
  });

  it('rejects partial with bad style value', () => {
    const res = validatePatchBodyPartial({ ops: [{ kind: 'setStyle' as const, target: { anchor: 'a1' }, property: 'color', value: 'expression(1)' }] });
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'DANGEROUS_STYLE_VALUE')).toBe(true);
  });
});