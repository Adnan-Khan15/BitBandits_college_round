// packages/engine/src/apply.ts
// Atomic patch application with an undo log and idempotency (PLAN 11.3, 11.6, 11.14).
// Browser-safe: no Node imports.

import type {
  AttributeName,
  BehaviorAction,
  FrozenPatch,
  PatchOp,
  Rect,
  Resolution,
  RuntimeManifest,
  RuntimePatchStatus,
  StyleProperty,
  TargetRef,
} from '@patchwork/shared';
import { resolveAnchor } from './resolve.js';

interface ApplyOptions {
  mode: 'smart' | 'selector';
  thresholds: RuntimeManifest['thresholds'];
}

const BEHAVIOR_KEYS = new WeakMap<Document, Set<string>>();

function pathnameOf(doc: Document): string | null {
  const href = doc.defaultView?.location?.href;
  if (!href || href.startsWith('about:')) return null;
  try {
    return new URL(href).pathname;
  } catch {
    return null;
  }
}

function normalisePath(p: string): string {
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

function matchesPath(urlPath: string, pathname: string | null): boolean {
  if (pathname === null) return true;
  if (urlPath.endsWith('/*')) {
    return normalisePath(pathname).startsWith(normalisePath(urlPath).slice(0, -1));
  }
  return normalisePath(pathname) === normalisePath(urlPath);
}

type Undo = () => void;

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function isSafeUrl(url: string): boolean {
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return true;
  if (url.startsWith('#')) return true;
  return /^https?:\/\//i.test(url);
}

export function applyPatch(doc: Document, patch: FrozenPatch, opts: ApplyOptions): RuntimePatchStatus {
  const base: RuntimePatchStatus = {
    patchId: patch.patchId,
    revision: patch.revision,
    applied: false,
    reason: 'ok',
    resolutions: [],
    affectedRects: [],
    error: null,
  };

  if (!matchesPath(patch.urlPath, pathnameOf(doc))) {
    return { ...base, reason: 'path_mismatch' };
  }

  const marker = `${patch.patchId}:${patch.revision}`;
  const resolved = new Map<string, Element>();
  const resolutions: Resolution[] = [];
  let failureReason: RuntimePatchStatus['reason'] | null = null;

  for (const [anchorId, fp] of Object.entries(patch.anchors)) {
    const res = resolveAnchor(doc, anchorId, fp, {
      mode: opts.mode,
      thresholds: opts.thresholds,
    });
    resolutions.push(res);
    if (res.status === 'ambiguous' && !failureReason) failureReason = 'anchor_ambiguous';
    else if (res.status === 'not_found' && !failureReason) failureReason = 'anchor_not_found';
    if (res.elementPath && res.status !== 'not_found') {
      const el = doc.querySelector(res.elementPath);
      if (el) resolved.set(anchorId, el);
    }
  }

  if (failureReason) {
    return { ...base, resolutions, reason: failureReason };
  }

  if (resolved.size === 0) {
    return { ...base, resolutions, reason: 'anchor_not_found' };
  }

  // Idempotency: skip when every resolved element already carries this marker.
  const already = [...resolved.values()].every(
    (el) => el.getAttribute('data-pw-applied') === marker,
  );
  if (already) {
    return { ...base, applied: true, resolutions, reason: 'ok' };
  }

  const undos: Undo[] = [];
  const touched = new Set<Element>();

  const targetOf = (ref: TargetRef): Element => {
    const el = resolved.get(ref.anchor);
    if (!el) throw new Error(`unresolved anchor '${ref.anchor}'`);
    return el;
  };

  const applyOp = (op: PatchOp): void => {
    switch (op.kind) {
      case 'setText': {
        const el = targetOf(op.target);
        const prev = el.textContent;
        touched.add(el);
        undos.push(() => {
          el.textContent = prev;
        });
        el.textContent = op.value;
        return;
      }
      case 'setAttribute': {
        const el = targetOf(op.target);
        const prev = el.getAttribute(op.name);
        touched.add(el);
        undos.push(() => {
          if (prev === null) el.removeAttribute(op.name);
          else el.setAttribute(op.name, prev);
        });
        el.setAttribute(op.name, op.value);
        return;
      }
      case 'removeAttribute': {
        const el = targetOf(op.target);
        const prev = el.getAttribute(op.name);
        touched.add(el);
        undos.push(() => {
          if (prev !== null) el.setAttribute(op.name, prev);
        });
        el.removeAttribute(op.name);
        return;
      }
      case 'setStyle': {
        const el = targetOf(op.target) as HTMLElement;
        const property: StyleProperty = op.property;
        const prev = el.style.getPropertyValue(property);
        const prevPriority = el.style.getPropertyPriority(property);
        touched.add(el);
        undos.push(() => {
          if (prev === '') el.style.removeProperty(property);
          else el.style.setProperty(property, prev, prevPriority);
        });
        el.style.setProperty(property, op.value);
        return;
      }
      case 'hide': {
        const el = targetOf(op.target) as HTMLElement;
        const prev = el.style.getPropertyValue('display');
        const prevPriority = el.style.getPropertyPriority('display');
        touched.add(el);
        undos.push(() => {
          if (prev === '') el.style.removeProperty('display');
          else el.style.setProperty('display', prev, prevPriority);
        });
        el.style.setProperty('display', 'none', 'important');
        return;
      }
      case 'show': {
        const el = targetOf(op.target) as HTMLElement;
        const prev = el.style.getPropertyValue('display');
        const prevPriority = el.style.getPropertyPriority('display');
        const hadHidden = el.hasAttribute('hidden');
        touched.add(el);
        undos.push(() => {
          if (prev === '') el.style.removeProperty('display');
          else el.style.setProperty('display', prev, prevPriority);
          if (hadHidden) el.setAttribute('hidden', '');
        });
        el.style.removeProperty('display');
        el.removeAttribute('hidden');
        return;
      }
      case 'move': {
        const el = targetOf(op.target);
        const ref = targetOf(op.reference);
        const originalParent = el.parentNode;
        const originalNext = el.nextSibling;
        touched.add(el);
        undos.push(() => {
          if (originalParent) originalParent.insertBefore(el, originalNext);
        });
        if (op.position === 'before') ref.parentNode?.insertBefore(el, ref);
        else if (op.position === 'after') ref.parentNode?.insertBefore(el, ref.nextSibling);
        else if (op.position === 'prepend') ref.insertBefore(el, ref.firstChild);
        else ref.appendChild(el);
        return;
      }
      case 'insertHTML': {
        const el = targetOf(op.target);
        const insertionParent =
          op.position === 'beforebegin' || op.position === 'afterend' ? el.parentNode : el;
        if (!insertionParent) throw new Error('insertHTML target has no parent');
        const before = new Set<ChildNode>(Array.from(insertionParent.childNodes));
        el.insertAdjacentHTML(op.position, op.html);
        const inserted = Array.from(insertionParent.childNodes).filter((n) => !before.has(n));
        for (const node of inserted) {
          if (node.nodeType === 1) (node as Element).setAttribute('data-pw-inserted', patch.patchId);
          touched.add(node as unknown as Element);
        }
        undos.push(() => {
          for (const node of inserted) node.parentNode?.removeChild(node);
        });
        return;
      }
      case 'setBehavior': {
        const el = targetOf(op.target) as HTMLElement;
        touched.add(el);
        const key = `${marker}:${op.event}`;
        let keys = BEHAVIOR_KEYS.get(doc);
        if (!keys) {
          keys = new Set();
          BEHAVIOR_KEYS.set(doc, keys);
        }
        if (keys.has(key)) return;
        keys.add(key);
        const listener = (event: Event): void => {
          const target = event.target as Node | null;
          if (!target || !el.contains(target)) return;
          if (op.mode === 'replace') {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
          runAction(doc, op.action, targetOf);
        };
        doc.addEventListener(op.event, listener, true);
        undos.push(() => {
          doc.removeEventListener(op.event, listener, true);
          BEHAVIOR_KEYS.get(doc)?.delete(key);
        });
        return;
      }
    }
  };

  try {
    for (const op of patch.ops) applyOp(op);
  } catch (err) {
    for (let i = undos.length - 1; i >= 0; i--) {
      try {
        undos[i]?.();
      } catch {
        /* undo best-effort */
      }
    }
    return {
      ...base,
      resolutions,
      reason: 'op_error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  for (const el of touched) el.setAttribute('data-pw-applied', marker);

  return {
    ...base,
    applied: true,
    resolutions,
    reason: 'ok',
    affectedRects: [...touched].filter((el) => el.nodeType === 1).map(rectOf),
  };
}

function runAction(doc: Document, action: BehaviorAction, targetOf: (r: TargetRef) => Element): void {
  switch (action.type) {
    case 'navigate': {
      if (!isSafeUrl(action.url)) return;
      const win = doc.defaultView;
      try {
        win?.location.assign(action.url);
      } catch {
        /* jsdom navigation not implemented */
      }
      return;
    }
    case 'preventDefault':
      return;
    case 'clickTarget': {
      const el = targetOf(action.target) as HTMLElement;
      el.click();
      return;
    }
    case 'toggleAttribute': {
      const el = targetOf(action.target);
      el.toggleAttribute(action.name as AttributeName);
      return;
    }
    case 'submitForm': {
      const el = targetOf(action.target) as HTMLFormElement;
      try {
        if (typeof el.requestSubmit === 'function') el.requestSubmit();
        else el.submit();
      } catch {
        /* jsdom form submission not implemented */
      }
      return;
    }
  }
}
