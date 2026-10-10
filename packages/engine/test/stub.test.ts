// packages/engine/test/stub.test.ts (owner: Dev A) - scaffold smoke test; Dev B replaces these.
import { describe, expect, it } from 'vitest';
import { AppError } from '@patchwork/shared';
import { applyPatch, captureFingerprint } from '../src/index.js';

describe('engine scaffold stubs', () => {
  it('throw NOT_IMPLEMENTED with the AppError shape', () => {
    expect(() => captureFingerprint(null as unknown as Element)).toThrowError(AppError);
    try {
      applyPatch(null as unknown as Document, null as never, {
        mode: 'smart',
        thresholds: { exact: 0.9, relocate: 0.65, margin: 0.15 },
      });
    } catch (err) {
      expect((err as AppError).code).toBe('NOT_IMPLEMENTED');
    }
  });
});
