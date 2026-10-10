// apps/web/test/bridge.test.ts (owner: Dev D)
// The origin/source guard is the security boundary of the editor bridge
// (PLAN 11.6, security table): a message from any other origin, or without the
// runtime's source tag, must never reach the handlers.
import { describe, expect, it, vi } from 'vitest';
import { isRuntimeMessage, pickStartMessage, pickStopMessage, highlightMessage } from '../src/preview/bridge.js';

const PREVIEW = 'http://localhost:4300';

describe('isRuntimeMessage', () => {
  it('accepts ready and picked from the preview origin', () => {
    expect(isRuntimeMessage(PREVIEW, PREVIEW, { source: 'patchwork-runtime', type: 'ready', status: {}, path: '/cart' })).toBe(true);
    expect(
      isRuntimeMessage(PREVIEW, PREVIEW, {
        source: 'patchwork-runtime',
        type: 'picked',
        fingerprint: { v: 1 },
        elementPath: '#x',
        current: { text: '', attrs: {}, styles: {} },
      }),
    ).toBe(true);
  });

  it('rejects messages from any other origin', () => {
    expect(isRuntimeMessage('http://evil.example', PREVIEW, { source: 'patchwork-runtime', type: 'ready' })).toBe(false);
    expect(isRuntimeMessage('http://localhost:4000', PREVIEW, { source: 'patchwork-runtime', type: 'picked' })).toBe(false);
  });

  it('rejects messages without the runtime source tag', () => {
    expect(isRuntimeMessage(PREVIEW, PREVIEW, { source: 'patchwork-editor', type: 'ready' })).toBe(false);
    expect(isRuntimeMessage(PREVIEW, PREVIEW, { source: 'someone-else', type: 'picked' })).toBe(false);
    expect(isRuntimeMessage(PREVIEW, PREVIEW, undefined)).toBe(false);
    expect(isRuntimeMessage(PREVIEW, PREVIEW, 'ready')).toBe(false);
  });

  it('rejects unknown message types', () => {
    expect(isRuntimeMessage(PREVIEW, PREVIEW, { source: 'patchwork-runtime', type: 'teapot' })).toBe(false);
  });

  it('rejects everything when no expected origin is configured', () => {
    expect(isRuntimeMessage(PREVIEW, '', { source: 'patchwork-runtime', type: 'ready' })).toBe(false);
  });
});

describe('editor -> runtime messages', () => {
  it('carries the editor source tag', () => {
    expect(pickStartMessage()).toEqual({ source: 'patchwork-editor', type: 'pick:start' });
    expect(pickStopMessage()).toEqual({ source: 'patchwork-editor', type: 'pick:stop' });
    expect(highlightMessage(null)).toEqual({ source: 'patchwork-editor', type: 'highlight', anchor: null });
  });
});
