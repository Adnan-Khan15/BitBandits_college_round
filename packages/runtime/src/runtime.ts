// packages/runtime/src/runtime.ts
// Browser runtime: applies the manifest, exposes window.__PATCHWORK__,
// re-applies on DOM churn, tracks JS errors and talks to the editor (PLAN 11.6, 11.17).
// Bundled to one IIFE by build.mjs. No Node imports.

import type { RuntimeManifest, RuntimePatchStatus, RuntimeStatus } from '@patchwork/shared';
import { applyPatch } from '@patchwork/engine';
import { createBeacon } from './beacon.js';
import { createEditorBridge } from './bridge.js';

declare global {
  interface Window {
    __PATCHWORK__?: { status: RuntimeStatus };
  }
}

const MANIFEST_URL = '/__patchwork/manifest.json';
const ANTI_FLICKER_MAX_MS = 800;
const REAPPLY_DEBOUNCE_MS = 50;
const REAPPLY_MAX = 20;

function hashManifest(manifest: RuntimeManifest): string {
  const s = JSON.stringify(manifest.patches);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function installAntiFlicker(): HTMLStyleElement {
  const style = document.createElement('style');
  style.id = 'pw-anti-flicker';
  style.textContent = 'body{visibility:hidden !important}';
  (document.head || document.documentElement).appendChild(style);
  return style;
}

function installBadge(applied: number): void {
  const el = document.createElement('div');
  el.setAttribute('data-pw-badge', '1');
  el.textContent = `PATCHWORK preview \u2014 ${applied} patch${applied === 1 ? '' : 'es'}`;
  Object.assign(el.style, {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    zIndex: '2147483646',
    background: '#111827',
    color: '#f9fafb',
    font: '12px/1.4 system-ui, sans-serif',
    padding: '6px 10px',
    borderRadius: '6px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>);
  document.body?.appendChild(el);
}

function applyManifest(doc: Document, manifest: RuntimeManifest): RuntimePatchStatus[] {
  return manifest.patches.map((patch) =>
    applyPatch(doc, patch, { mode: manifest.resolverMode, thresholds: manifest.thresholds }),
  );
}

function signature(patches: RuntimePatchStatus[]): string {
  return patches.map((p) => `${p.patchId}:${p.applied ? '1' : '0'}:${p.reason}`).join('|');
}

async function bootstrap(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const antiFlicker = installAntiFlicker();
  const removeAntiFlicker = (): void => antiFlicker.remove();
  window.setTimeout(removeAntiFlicker, ANTI_FLICKER_MAX_MS);

  let manifest: RuntimeManifest | null = null;
  try {
    const res = await fetch(MANIFEST_URL, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    manifest = (await res.json()) as RuntimeManifest;
  } catch {
    manifest = null;
  }

  if (!manifest) {
    window.__PATCHWORK__ = { status: { ready: true, manifestHash: '0', patches: [] } };
    removeAntiFlicker();
    window.dispatchEvent(new CustomEvent('patchwork:ready'));
    return;
  }

  const m = manifest;
  const beacon = createBeacon(m);
  const bridge = createEditorBridge(m);
  let lastSig = '';

  const emit = (patches: RuntimePatchStatus[]): void => {
    window.__PATCHWORK__ = { status: { ready: true, manifestHash: hashManifest(m), patches } };
    const sig = signature(patches);
    if (sig === lastSig) return;
    lastSig = sig;
    for (const p of patches) {
      beacon.push({
        type: p.applied ? 'patch_applied' : 'patch_skipped',
        patchId: p.patchId,
        revision: p.revision,
        reason: p.reason,
      });
    }
  };

  const doApply = (): RuntimePatchStatus[] => {
    const patches = applyManifest(document, m);
    emit(patches);
    return patches;
  };

  const run = (): void => {
    const patches = doApply();
    removeAntiFlicker();
    const status = window.__PATCHWORK__?.status;
    if (status) bridge.postReady(status);
    window.dispatchEvent(new CustomEvent('patchwork:ready'));

    if (m.channel === 'preview') installBadge(patches.filter((p) => p.applied).length);

    window.addEventListener('error', (event) => {
      const ev = event as ErrorEvent;
      const stack = ev.error && typeof (ev.error as Error).stack === 'string' ? (ev.error as Error).stack : '';
      const source = ev.filename || null;
      beacon.push({
        type: 'js_error',
        message: ev.message || String(ev.error ?? 'error'),
        source,
        patchwork: /patchwork/i.test(`${stack} ${source ?? ''}`),
      });
    });

    let reapplies = 0;
    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      if (reapplies >= REAPPLY_MAX) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        reapplies += 1;
        doApply();
      }, REAPPLY_DEBOUNCE_MS);
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('pagehide', () => beacon.flush());
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

void bootstrap();
