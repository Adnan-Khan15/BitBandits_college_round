// packages/engine/src/conflicts.ts
// Conflict analysis across patches sharing a snapshot (PLAN 11.5, 11.14).
// Browser-safe: no Node imports.

import type {
  Conflict,
  ConflictReport,
  ElementFingerprint,
  FrozenPatch,
  Id,
  PatchOp,
  Resolution,
} from '@patchwork/shared';
import { resolveAnchor } from './resolve.js';
import { uniqueCssPath } from './fingerprint.js';
import { applyPatch } from './apply.js';

interface ResolvedPatch {
  patch: FrozenPatch;
  elements: Map<string, Element>;
  resolutions: Resolution[];
}

function resolvePatch(doc: Document, patch: FrozenPatch): ResolvedPatch {
  const elements = new Map<string, Element>();
  const resolutions: Resolution[] = [];
  for (const [anchorId, fp] of Object.entries(patch.anchors)) {
    const res = resolveAnchor(doc, anchorId, fp);
    resolutions.push(res);
    if (res.elementPath && res.status !== 'not_found') {
      const el = doc.querySelector(res.elementPath);
      if (el) elements.set(anchorId, el);
    }
  }
  return { patch, elements, resolutions };
}

function propertyKey(op: PatchOp): string | null {
  switch (op.kind) {
    case 'setText':
      return 'text';
    case 'setAttribute':
    case 'removeAttribute':
      return `attr:${op.name}`;
    case 'setStyle':
      return `style:${op.property}`;
    case 'hide':
    case 'show':
      return 'visibility';
    case 'move':
      return 'position';
    case 'insertHTML':
      return `insert:${op.position}`;
    case 'setBehavior':
      return `behavior:${op.event}`;
  }
}

function opValue(op: PatchOp): string | null {
  switch (op.kind) {
    case 'setText':
      return op.value;
    case 'setAttribute':
      return op.value;
    case 'removeAttribute':
      return null;
    case 'setStyle':
      return op.value;
    case 'hide':
      return 'hidden';
    case 'show':
      return 'visible';
    case 'move':
      return op.position;
    case 'insertHTML':
      return op.position;
    case 'setBehavior':
      return `${op.event}:${op.mode}`;
  }
}

function hashId(parts: string[]): string {
  let h = 5381;
  const s = parts.join('\u0000');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function makeConflict(
  type: Conflict['type'],
  severity: Conflict['severity'],
  patchIds: [Id] | [Id, Id],
  elementPath: string | null,
  property: string | null,
  values: Conflict['values'],
  message: string,
  resolutions: Conflict['resolutions'],
): Conflict {
  return {
    id: hashId([type, ...patchIds, elementPath ?? '', property ?? '']),
    type,
    severity,
    patchIds,
    elementPath,
    property,
    values,
    message,
    resolutions,
  };
}

function isDescendantOrSelf(ancestor: Element, node: Element): boolean {
  return ancestor === node || ancestor.contains(node);
}

interface OpEntry {
  op: PatchOp;
  index: number;
  element: Element | null;
  elementPath: string | null;
}

function opEntries(rp: ResolvedPatch): OpEntry[] {
  const out: OpEntry[] = [];
  rp.patch.ops.forEach((op, index) => {
    const ref = op.target;
    const el = rp.elements.get(ref.anchor) ?? null;
    out.push({ op, index, element: el, elementPath: el ? uniqueCssPath(el) : null });
  });
  return out;
}

export function analyzeConflicts(
  doc: Document,
  against: FrozenPatch[],
  candidates: FrozenPatch[],
): Pick<ConflictReport, 'candidateIds' | 'againstIds' | 'resolutions' | 'conflicts' | 'blocking'> {
  const resolvedAgainst = against.map((p) => resolvePatch(doc, p));
  const resolvedCandidates = candidates.map((p) => resolvePatch(doc, p));

  const resolutions: Record<Id, Resolution[]> = {};
  for (const rp of [...resolvedAgainst, ...resolvedCandidates]) {
    resolutions[rp.patch.patchId] = rp.resolutions;
  }

  const conflicts: Conflict[] = [];

  // Anchor-level problems per candidate (blocking).
  for (const rp of resolvedCandidates) {
    for (const res of rp.resolutions) {
      if (res.status === 'ambiguous') {
        conflicts.push(
          makeConflict(
            'AMBIGUOUS_TARGET',
            'blocking',
            [rp.patch.patchId],
            res.elementPath,
            null,
            null,
            `Anchor '${res.anchorId}' is ambiguous (confidence ${res.confidence.toFixed(3)})`,
            ['edit_patch'],
          ),
        );
      } else if (res.status === 'not_found') {
        conflicts.push(
          makeConflict(
            'UNRESOLVED_TARGET',
            'blocking',
            [rp.patch.patchId],
            null,
            null,
            null,
            `Anchor '${res.anchorId}' was not found`,
            ['edit_patch'],
          ),
        );
      }
    }
  }

  for (const cand of resolvedCandidates) {
    const candOps = opEntries(cand);
    for (const againstRp of resolvedAgainst) {
      const againstOps = opEntries(againstRp);

      // SAME_PROPERTY
      for (const c of candOps) {
        if (!c.element) continue;
        for (const a of againstOps) {
          if (!a.element || a.element !== c.element) continue;
          const cKey = propertyKey(c.op);
          const aKey = propertyKey(a.op);
          if (cKey === null || cKey !== aKey) continue;
          const cVal = opValue(c.op);
          const aVal = opValue(a.op);
          if (cVal === aVal) continue;
          conflicts.push(
            makeConflict(
              'SAME_PROPERTY',
              'blocking',
              [cand.patch.patchId, againstRp.patch.patchId],
              c.elementPath,
              cKey,
              { base: cand.patch.baseValues[c.index] ?? null, candidate: cVal, existing: aVal },
              `Both patches set '${cKey}' on the same element with different values`,
              ['candidate_overrides', 'withdraw_candidate_op', 'edit_patch'],
            ),
          );
        }
      }

      // TEXT_OVERWRITES_CHILD
      for (const c of candOps) {
        if (c.op.kind !== 'setText' || !c.element) continue;
        for (const a of againstOps) {
          if (!a.element || a.element === c.element) continue;
          if (c.element.contains(a.element)) {
            conflicts.push(
              makeConflict(
                'TEXT_OVERWRITES_CHILD',
                'blocking',
                [cand.patch.patchId, againstRp.patch.patchId],
                c.elementPath,
                'text',
                null,
                `setText on an element whose descendant is targeted by another patch`,
                ['withdraw_candidate_op', 'edit_patch'],
              ),
            );
          }
        }
      }

      // MOVE_MOVE
      for (const c of candOps) {
        if (c.op.kind !== 'move' || !c.element) continue;
        for (const a of againstOps) {
          if (a.op.kind !== 'move' || !a.element || a.element !== c.element) continue;
          conflicts.push(
            makeConflict(
              'MOVE_MOVE',
              'blocking',
              [cand.patch.patchId, againstRp.patch.patchId],
              c.elementPath,
              'position',
              { base: cand.patch.baseValues[c.index] ?? null, candidate: opValue(c.op), existing: opValue(a.op) },
              `Both patches move the same element`,
              ['candidate_overrides', 'withdraw_candidate_op', 'edit_patch'],
            ),
          );
        }
      }

      // INSERT_ORDER
      for (const c of candOps) {
        if (c.op.kind !== 'insertHTML' || !c.element) continue;
        for (const a of againstOps) {
          if (a.op.kind !== 'insertHTML' || !a.element || a.element !== c.element) continue;
          if (a.op.position !== c.op.position) continue;
          conflicts.push(
            makeConflict(
              'INSERT_ORDER',
              'warning',
              [cand.patch.patchId, againstRp.patch.patchId],
              c.elementPath,
              `insert:${c.op.position}`,
              null,
              `Both patches insert at the same element and position`,
              ['reorder', 'edit_patch'],
            ),
          );
        }
      }

      // EDIT_HIDDEN (warning): a hide in one patch vs edits in the other.
      const candHides = candOps.filter((o) => o.op.kind === 'hide' && o.element);
      const againstHides = againstOps.filter((o) => o.op.kind === 'hide' && o.element);
      for (const h of candHides) {
        const hidden = h.element as Element;
        for (const e of againstOps) {
          if (!e.element || e.op.kind === 'hide' || e.op.kind === 'insertHTML') continue;
          if (isDescendantOrSelf(hidden, e.element) || isDescendantOrSelf(e.element, hidden)) {
            conflicts.push(
              makeConflict(
                'EDIT_HIDDEN',
                'warning',
                [cand.patch.patchId, againstRp.patch.patchId],
                uniqueCssPath(hidden),
                'visibility',
                null,
                `A patch hides an element another patch edits (or an ancestor)`,
                ['candidate_overrides', 'withdraw_candidate_op', 'edit_patch'],
              ),
            );
          }
        }
      }
      for (const h of againstHides) {
        const hidden = h.element as Element;
        for (const e of candOps) {
          if (!e.element || e.op.kind === 'hide' || e.op.kind === 'insertHTML') continue;
          if (isDescendantOrSelf(hidden, e.element) || isDescendantOrSelf(e.element, hidden)) {
            conflicts.push(
              makeConflict(
                'EDIT_HIDDEN',
                'warning',
                [cand.patch.patchId, againstRp.patch.patchId],
                uniqueCssPath(hidden),
                'visibility',
                null,
                `A patch hides an element another patch edits (or an ancestor)`,
                ['candidate_overrides', 'withdraw_candidate_op', 'edit_patch'],
              ),
            );
          }
        }
      }
    }
  }

  // STALE_BASE (warning): candidate baseValues differ from head-applied values.
  const staleConflicts = detectStaleBase(doc, resolvedAgainst, resolvedCandidates);
  conflicts.push(...staleConflicts);

  const deduped = dedupe(conflicts);

  return {
    candidateIds: candidates.map((p) => p.patchId),
    againstIds: against.map((p) => p.patchId),
    resolutions,
    conflicts: deduped,
    blocking: deduped.some((c) => c.severity === 'blocking'),
  };
}

function dedupe(conflicts: Conflict[]): Conflict[] {
  const seen = new Set<string>();
  const out: Conflict[] = [];
  for (const c of conflicts) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

function readProperty(el: Element, key: string): string | null {
  if (key === 'text') return el.textContent;
  if (key === 'visibility') return (el as HTMLElement).style.getPropertyValue('display') || 'visible';
  if (key.startsWith('attr:')) return el.getAttribute(key.slice(5));
  if (key.startsWith('style:')) return (el as HTMLElement).style.getPropertyValue(key.slice(6));
  return null;
}

function detectStaleBase(
  doc: Document,
  against: ResolvedPatch[],
  candidates: ResolvedPatch[],
): Conflict[] {
  if (against.length === 0) return [];
  const clone = doc.cloneNode(true) as Document;
  for (const rp of against) {
    try {
      applyPatch(clone, rp.patch, { mode: 'smart', thresholds: { exact: 0.9, relocate: 0.65, margin: 0.15 } });
    } catch {
      /* ignore clone application errors for stale detection */
    }
  }

  const out: Conflict[] = [];
  for (const cand of candidates) {
    for (const [anchorKey, fp] of Object.entries(cand.patch.anchors)) {
      const el = cand.elements.get(anchorKey);
      if (!el) continue;
      const cloneEl = findInClone(clone, fp);
      if (!cloneEl) continue;
      cand.patch.ops.forEach((op, index) => {
        const declared = cand.patch.baseValues[index];
        if (declared === undefined || declared === null) return;
        const key = propertyKey(op);
        if (key === null) return;
        const current = readProperty(cloneEl, key);
        if (current !== declared) {
          out.push(
            makeConflict(
              'STALE_BASE',
              'warning',
              [cand.patch.patchId],
              uniqueCssPath(el),
              key,
              { base: declared, candidate: opValue(op), existing: current },
              `Patch was authored against an older value of '${key}'`,
              ['edit_patch'],
            ),
          );
        }
      });
    }
  }
  return out;
}

function findInClone(clone: Document, fp: ElementFingerprint): Element | null {
  if (fp.cssPath) {
    try {
      const matches = clone.querySelectorAll(fp.cssPath);
      if (matches.length === 1) return matches[0] ?? null;
    } catch {
      /* fall through */
    }
  }
  return null;
}
