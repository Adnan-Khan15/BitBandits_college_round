// apps/web/src/preview/bridge.ts (owner: Dev D)
// Editor side of the postMessage bridge (PLAN 11.6). The runtime in the preview
// iframe accepts messages only from its manifest.editor.allowedOrigin; we accept
// its replies only from the preview origin and only with its source tag.
import { useCallback, useEffect, useRef } from 'react';
import type {
  EditorToRuntime,
  ElementFingerprint,
  RuntimeStatus,
  RuntimeToEditor,
} from '@patchwork/shared';

export const EDITOR_SOURCE = 'patchwork-editor';
export const RUNTIME_SOURCE = 'patchwork-runtime';

/** Origin + source + type guard: anything else is ignored, never trusted. */
export function isRuntimeMessage(
  origin: string,
  expectedOrigin: string,
  data: unknown,
): data is Extract<RuntimeToEditor, { type: 'ready' } | { type: 'picked' }> {
  if (!expectedOrigin || origin !== expectedOrigin) return false;
  if (typeof data !== 'object' || data === null) return false;
  const message = data as { source?: unknown; type?: unknown };
  if (message.source !== RUNTIME_SOURCE) return false;
  return message.type === 'ready' || message.type === 'picked';
}

export function pickStartMessage(): EditorToRuntime {
  return { source: EDITOR_SOURCE, type: 'pick:start' };
}

export function pickStopMessage(): EditorToRuntime {
  return { source: EDITOR_SOURCE, type: 'pick:stop' };
}

export function highlightMessage(anchor: ElementFingerprint | null): EditorToRuntime {
  return { source: EDITOR_SOURCE, type: 'highlight', anchor };
}

export interface BridgeHandlers {
  previewOrigin: string;
  onReady?: (status: RuntimeStatus, path: string) => void;
  onPicked?: (
    fingerprint: ElementFingerprint,
    elementPath: string,
    current: { text: string; attrs: Record<string, string>; styles: Record<string, string> },
  ) => void;
}

/**
 * Listens for the runtime inside the preview iframe and sends it commands.
 * `send` posts to the iframe's content window with the preview origin as the
 * exact target, per the contract.
 */
export function useRuntimeBridge(handlers: BridgeHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const current = handlersRef.current;
      if (!isRuntimeMessage(event.origin, current.previewOrigin, event.data)) return;
      if (event.data.type === 'ready') current.onReady?.(event.data.status, event.data.path);
      else current.onPicked?.(event.data.fingerprint, event.data.elementPath, event.data.current);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const send = useCallback((message: EditorToRuntime, iframe: HTMLIFrameElement | null) => {
    const content = iframe?.contentWindow;
    if (!content) return;
    content.postMessage(message, handlersRef.current.previewOrigin);
  }, []);

  return { send };
}
