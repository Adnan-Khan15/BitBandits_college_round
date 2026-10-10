// packages/shared/test/contracts.test.ts (owner: Dev A) - scaffold smoke test for the contracts.
import { describe, expect, it } from 'vitest';
import {
  AppError,
  DEFAULT_THRESHOLDS,
  ERROR_HTTP_STATUS,
  STYLE_ALLOWLIST,
  patchBodySchema,
} from '../src/index.js';

describe('shared contracts', () => {
  it('pins the initial resolver thresholds', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ exact: 0.9, relocate: 0.65, margin: 0.15 });
  });

  it('maps every error code to an HTTP status', () => {
    expect(ERROR_HTTP_STATUS.VALIDATION_FAILED).toBe(400);
    expect(ERROR_HTTP_STATUS.MERGE_BLOCKED).toBe(409);
    expect(ERROR_HTTP_STATUS.NOT_IMPLEMENTED).toBe(501);
    expect(Object.keys(ERROR_HTTP_STATUS).sort()).toEqual(
      [
        'FORBIDDEN',
        'INTERNAL',
        'INVALID_STATE',
        'MERGE_BLOCKED',
        'NOT_FOUND',
        'NOT_IMPLEMENTED',
        'STALE_REVISION',
        'UPSTREAM_UNREACHABLE',
        'VALIDATION_FAILED',
        'VERIFICATION_REQUIRED',
      ].sort(),
    );
  });

  it('renders AppError as the ApiError shape', () => {
    const err = new AppError('MERGE_BLOCKED', 'blocking conflict', { blocking: true });
    expect(err.httpStatus).toBe(409);
    expect(err.toApiError('req_1')).toEqual({
      error: { code: 'MERGE_BLOCKED', message: 'blocking conflict', details: { blocking: true }, requestId: 'req_1' },
    });
  });

  it('rejects a patch body with a bad anchor key or unknown op kind (zod contract)', () => {
    const badKey = patchBodySchema.safeParse({
      urlPath: '/cart',
      anchors: { 'Bad Key!': { v: 1, tag: 'button', id: null, testId: null, name: null, classes: [], text: '', accessibleName: null, role: null, attrs: {}, cssPath: 'button', xpath: '//button', ancestors: [], siblingIndex: 0, neighborText: '', rect: null, capturedAt: '', capturedFromHash: '' } },
      ops: [{ kind: 'hide', target: { anchor: 'Bad Key!' } }],
      checks: [],
      baseSnapshotId: null,
      baseValues: {},
    });
    expect(badKey.success).toBe(false);

    const goodAnchor = { v: 1, tag: 'button', id: null, testId: null, name: null, classes: [], text: '', accessibleName: null, role: null, attrs: {}, cssPath: 'button', xpath: '//button', ancestors: [], siblingIndex: 0, neighborText: '', rect: null, capturedAt: '', capturedFromHash: '' };
    const badOp = patchBodySchema.safeParse({
      urlPath: '/cart',
      anchors: { a1: goodAnchor },
      ops: [{ kind: 'eval', target: { anchor: 'a1' } }],
      checks: [],
      baseSnapshotId: null,
      baseValues: {},
    });
    expect(badOp.success).toBe(false);
  });

  it('exposes the style allowlist for the inspector UI', () => {
    expect(STYLE_ALLOWLIST).toContain('color');
    expect(STYLE_ALLOWLIST).toContain('pointer-events');
  });
});
