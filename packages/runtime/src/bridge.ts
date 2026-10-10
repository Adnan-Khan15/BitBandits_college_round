// packages/runtime/src/bridge.ts
// Editor bridge over postMessage (PLAN 11.6). No Node imports.

import type {
  EditorToRuntime,
  ElementFingerprint,
  RuntimeManifest,
  RuntimeStatus,
  RuntimeToEditor,
} from '@patchwork/shared';
import { ATTRIBUTE_ALLOWLIST, STYLE_ALLOWLIST } from '@patchwork/shared';
import { captureFingerprint, resolveAnchor, uniqueCssPath } from '@patchwork/engine';

export interface EditorBridge {
  postReady(status: RuntimeStatus): void;
  destroy(): void;
}

const NOOP_BRIDGE: EditorBridge = { postReady: () => {}, destroy: () => {} };

export function createEditorBridge(manifest: RuntimeManifest): EditorBridge {
  const allowedOrigin = manifest.editor.allowedOrigin;
  if (!manifest.editor.enabled || !allowedOrigin || typeof window === 'undefined') {
    return NOOP_BRIDGE;
  }
  const allowed: string = allowedOrigin;

  const overlay = document.createElement('div');
  overlay.setAttribute('data-pw-overlay', '1');
  Object.assign(overlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    border: '2px solid #e11d48',
    background: 'rgba(225,29,72,0.12)',
    borderRadius: '2px',
    display: 'none',
    boxSizing: 'border-box',
  } as Partial<CSSStyleDeclaration>);

  let pickActive = false;

  const ensureOverlay = (): void => {
    if (!overlay.isConnected && document.body) document.body.appendChild(overlay);
  };

  const outlineAt = (el: Element | null): void => {
    ensureOverlay();
    if (!el) {
      overlay.style.display = 'none';
      return;
    }
    const r = el.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: 'block',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    } as Partial<CSSStyleDeclaration>);
  };

  const currentFor = (el: Element): { text: string; attrs: Record<string, string>; styles: Record<string, string> } => {
    const attrs: Record<string, string> = {};
    for (const name of ATTRIBUTE_ALLOWLIST) {
      const v = el.getAttribute(name);
      if (v !== null) attrs[name] = v;
    }
    const computed = window.getComputedStyle(el);
    const styles: Record<string, string> = {};
    for (const prop of STYLE_ALLOWLIST) {
      styles[prop] = computed.getPropertyValue(prop);
    }
    return {
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
      attrs,
      styles,
    };
  };

  const post = (message: RuntimeToEditor): void => {
    window.parent?.postMessage(message, allowed);
    if (window.parent !== window) window.postMessage(message, allowed);
  };

  const onClick = (event: MouseEvent): void => {
    if (!pickActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const el = event.target as Element | null;
    if (!el) return;
    const fingerprint: ElementFingerprint = captureFingerprint(el, { withRect: true });
    const message: RuntimeToEditor = {
      source: 'patchwork-runtime',
      type: 'picked',
      fingerprint,
      elementPath: uniqueCssPath(el),
      current: currentFor(el),
    };
    post(message);
    stopPick();
  };

  const onMove = (event: MouseEvent): void => {
    if (!pickActive) return;
    outlineAt(event.target as Element | null);
  };

  const startPick = (): void => {
    if (pickActive) return;
    pickActive = true;
    ensureOverlay();
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
  };

  const stopPick = (): void => {
    if (!pickActive) return;
    pickActive = false;
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    overlay.style.display = 'none';
  };

  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== allowed) return;
    const data = event.data as EditorToRuntime | undefined;
    if (!data || data.source !== 'patchwork-editor') return;
    if (data.type === 'pick:start') startPick();
    else if (data.type === 'pick:stop') stopPick();
    else if (data.type === 'highlight') {
      if (!data.anchor) {
        outlineAt(null);
        return;
      }
      const res = resolveAnchor(document, 'highlight', data.anchor, {
        mode: 'smart',
        thresholds: manifest.thresholds,
      });
      outlineAt(res.elementPath ? document.querySelector(res.elementPath) : null);
    }
  };

  window.addEventListener('message', onMessage);

  return {
    postReady(status: RuntimeStatus): void {
      window.parent?.postMessage(
        { source: 'patchwork-runtime', type: 'ready', status, path: location.pathname },
        allowed,
      );
    },
    destroy(): void {
      stopPick();
      window.removeEventListener('message', onMessage);
      overlay.remove();
    },
  };
}
