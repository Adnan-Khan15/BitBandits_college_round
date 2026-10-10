// apps/server/src/core/validate.ts (owner: Dev A)
// Phase 2 step 10: validatePatchBody per PLAN 11.4.
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { patchBodySchema, type PatchBodyParsed, type PatchOp } from '@patchwork/shared';
import { type Issue, type ValidationResult } from '@patchwork/shared';
import { ATTRIBUTE_ALLOWLIST, LIMITS, STYLE_ALLOWLIST, URL_ALLOWED_PROTOCOLS } from '@patchwork/shared';

const window = new JSDOM('<!DOCTYPE html><html><body></body></html>').window;
const DOMPurify = createDOMPurify(window);

// --- semantic rules --------------------------------------------------------

function checkAnchorReferences(body: PatchBodyParsed): Issue[] {
  const issues: Issue[] = [];
  const anchorKeys = new Set(Object.keys(body.anchors));
  for (let i = 0; i < body.ops.length; i++) {
    const op = body.ops[i];
    if (!op) continue;
    if (!op.target?.anchor) continue;
    if (!anchorKeys.has(op.target.anchor)) {
      issues.push({ code: 'ANCHOR_NOT_FOUND', message: `Anchor "${op.target.anchor}" referenced in op ${i} but not defined in anchors`, path: ['ops', i, 'target', 'anchor'], severity: 'error' });
    }
    if (op.kind === 'move') {
      if (op.reference?.anchor && !anchorKeys.has(op.reference.anchor)) {
        issues.push({ code: 'ANCHOR_NOT_FOUND', message: `Reference anchor "${op.reference.anchor}" in move op ${i} not defined`, path: ['ops', i, 'reference', 'anchor'], severity: 'error' });
      }
    }
    if (op.kind === 'setBehavior') {
      const a = op.action;
      if (a.type === 'clickTarget' && a.target?.anchor && !anchorKeys.has(a.target.anchor)) {
        issues.push({ code: 'ANCHOR_NOT_FOUND', message: `clickTarget anchor "${a.target.anchor}" in op ${i} not defined`, path: ['ops', i, 'action', 'target', 'anchor'], severity: 'error' });
      }
      if (a.type === 'toggleAttribute' && a.target?.anchor && !anchorKeys.has(a.target.anchor)) {
        issues.push({ code: 'ANCHOR_NOT_FOUND', message: `toggleAttribute target anchor "${a.target.anchor}" in op ${i} not defined`, path: ['ops', i, 'action', 'target', 'anchor'], severity: 'error' });
      }
      if (a.type === 'submitForm' && a.target?.anchor && !anchorKeys.has(a.target.anchor)) {
        issues.push({ code: 'ANCHOR_NOT_FOUND', message: `submitForm target anchor "${a.target.anchor}" in op ${i} not defined`, path: ['ops', i, 'action', 'target', 'anchor'], severity: 'error' });
      }
    }
  }
  return issues;
}

function checkStyleProperties(body: PatchBodyParsed): Issue[] {
  const issues: Issue[] = [];
  for (let i = 0; i < body.ops.length; i++) {
    const op = body.ops[i];
    if (!op || op.kind !== 'setStyle') continue;
    const value = op.value;
    const lower = value.toLowerCase();
    if (lower.includes('expression(')) issues.push({ code: 'DANGEROUS_STYLE_VALUE', message: 'expression() is not allowed in style values', path: ['ops', i, 'value'], severity: 'error' });
    if (lower.includes('@import')) issues.push({ code: 'DANGEROUS_STYLE_VALUE', message: '@import is not allowed in style values', path: ['ops', i, 'value'], severity: 'error' });
    if (lower.includes('url(') && !lower.includes('url("https:') && !lower.includes("url('https:") && !lower.includes('url(https:')) {
      issues.push({ code: 'DANGEROUS_STYLE_VALUE', message: 'url() must use https: protocol', path: ['ops', i, 'value'], severity: 'error' });
    }
    if (value.includes('<') || value.includes('\\')) issues.push({ code: 'DANGEROUS_STYLE_VALUE', message: 'Style value contains disallowed characters', path: ['ops', i, 'value'], severity: 'error' });
  }
  return issues;
}

function checkAttributeNames(body: PatchBodyParsed): Issue[] {
  const issues: Issue[] = [];
  for (let i = 0; i < body.ops.length; i++) {
    const op = body.ops[i];
    if (!op || (op.kind !== 'setAttribute' && op.kind !== 'removeAttribute')) continue;
    const lower = op.name.toLowerCase();
    if (lower.startsWith('on')) issues.push({ code: 'DANGEROUS_ATTRIBUTE', message: 'on* event handler attributes are not allowed', path: ['ops', i, 'name'], severity: 'error' });
    if (['srcdoc', 'style', 'formaction'].includes(lower)) issues.push({ code: 'DANGEROUS_ATTRIBUTE', message: `Attribute "${op.name}" is not allowed`, path: ['ops', i, 'name'], severity: 'error' });
  }
  return issues;
}

function checkUrls(body: PatchBodyParsed): Issue[] {
  const issues: Issue[] = [];
  for (let i = 0; i < body.ops.length; i++) {
    const op = body.ops[i];
    if (!op) continue;
    if (op.kind === 'setAttribute' && (op.name === 'href' || op.name === 'src') && op.value) {
      try {
        const url = new URL(op.value, 'http://localhost');
        if (!URL_ALLOWED_PROTOCOLS.includes(url.protocol as typeof URL_ALLOWED_PROTOCOLS[number])) {
          issues.push({ code: 'INVALID_URL_PROTOCOL', message: `URL protocol "${url.protocol}" not allowed`, path: ['ops', i, 'value'], severity: 'error' });
        }
      } catch { /* relative - allowed */ }
    }
    if (op.kind === 'setBehavior' && op.action.type === 'navigate') {
      try {
        const url = new URL(op.action.url, 'http://localhost');
        if (!URL_ALLOWED_PROTOCOLS.includes(url.protocol as typeof URL_ALLOWED_PROTOCOLS[number])) {
          issues.push({ code: 'INVALID_URL_PROTOCOL', message: `Navigate URL protocol "${url.protocol}" not allowed`, path: ['ops', i, 'action', 'url'], severity: 'error' });
        }
      } catch { /* relative - allowed */ }
    }
  }
  return issues;
}

function checkLengthLimits(body: PatchBodyParsed): Issue[] {
  const issues: Issue[] = [];
  for (let i = 0; i < body.ops.length; i++) {
    const op = body.ops[i];
    if (!op) continue;
    if (op.kind === 'setText' && op.value.length > LIMITS.textMaxLength) issues.push({ code: 'TEXT_TOO_LONG', message: `setText value exceeds ${LIMITS.textMaxLength} characters`, path: ['ops', i, 'value'], severity: 'error' });
    if (op.kind === 'insertHTML' && op.html.length > LIMITS.htmlMaxLength) issues.push({ code: 'HTML_TOO_LONG', message: `insertHTML value exceeds ${LIMITS.htmlMaxLength} bytes`, path: ['ops', i, 'html'], severity: 'error' });
  }
  return issues;
}

// --- DOMPurify sanitization for insertHTML ---------------------------------

function sanitizeInsertHtml(body: PatchBodyParsed): { sanitized: PatchBodyParsed; warnings: Issue[] } {
  const warnings: Issue[] = [];
  if (!body.ops.some((op): op is Extract<PatchOp, { kind: 'insertHTML' }> => !!op && op.kind === 'insertHTML')) return { sanitized: body, warnings: [] };
  const ops = [...body.ops];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op || op.kind !== 'insertHTML') continue;
    const clean = DOMPurify.sanitize(op.html, { RETURN_DOM_FRAGMENT: false, WHOLE_DOCUMENT: false });
    if (clean !== op.html) {
      warnings.push({ code: 'HTML_SANITIZED', message: 'insertHTML was sanitized (scripts, iframes, event handlers removed)', path: ['ops', i, 'html'], severity: 'warning' });
      ops[i] = { ...op, html: clean };
    }
  }
  return { sanitized: { ...body, ops }, warnings };
}

// --- main export -----------------------------------------------------------

/** Validate a PatchBody per PLAN 11.4. Returns ValidationResult. */
export function validatePatchBody(input: unknown): ValidationResult {
  const parsed = patchBodySchema.safeParse(input);
  if (!parsed.success) {
    const issues: Issue[] = parsed.error.issues.map((e) => ({
      code: 'ZOD_VALIDATION',
      message: `${e.path.join('.')}: ${e.message}`,
      path: e.path as (string | number)[],
      severity: 'error',
    }));
    return { valid: false, issues, sanitized: null };
  }
  const body = parsed.data;

  const semanticIssues = [
    ...checkAnchorReferences(body),
    ...checkStyleProperties(body),
    ...checkAttributeNames(body),
    ...checkUrls(body),
    ...checkLengthLimits(body),
  ];

  if (semanticIssues.length > 0) return { valid: false, issues: semanticIssues, sanitized: null };

  const { sanitized, warnings } = sanitizeInsertHtml(body);
  return { valid: true, issues: warnings, sanitized: warnings.length > 0 ? sanitized : null };
}

/** Partial validation for PATCH updates. */
export function validatePatchBodyPartial(input: unknown): ValidationResult {
  const result = patchBodySchema.partial().safeParse(input);
  if (!result.success) {
    const issues: Issue[] = result.error.issues.map((e) => ({
      code: 'ZOD_VALIDATION',
      message: `${e.path.join('.')}: ${e.message}`,
      path: e.path as (string | number)[],
      severity: 'error',
    }));
    return { valid: false, issues, sanitized: null };
  }
  const partial = result.data;
  const ops = partial.ops ?? [];
  const anchors = partial.anchors ?? {};
  if (ops.length > 0 || Object.keys(anchors).length > 0) {
    const bodyForCheck: PatchBodyParsed = { urlPath: partial.urlPath ?? '', anchors, ops, checks: partial.checks ?? [], baseSnapshotId: partial.baseSnapshotId ?? null, baseValues: partial.baseValues ?? {} };
    const semanticIssues = [...checkAnchorReferences(bodyForCheck), ...checkStyleProperties(bodyForCheck), ...checkAttributeNames(bodyForCheck), ...checkUrls(bodyForCheck), ...checkLengthLimits(bodyForCheck)];
    if (semanticIssues.length > 0) return { valid: false, issues: semanticIssues, sanitized: null };
    if (ops.some((op): op is Extract<PatchOp, { kind: 'insertHTML' }> => !!op && op.kind === 'insertHTML')) {
      const { sanitized, warnings } = sanitizeInsertHtml(bodyForCheck);
      return { valid: true, issues: warnings, sanitized: warnings.length > 0 ? sanitized : null };
    }
  }
  return { valid: true, issues: [], sanitized: null };
}