// packages/shared/src/errors.ts (owner: Dev A)
// Contract: docs/PLAN.md section 11.11.
// 400 VALIDATION_FAILED - 403 FORBIDDEN - 404 NOT_FOUND - 409 INVALID_STATE | STALE_REVISION |
// MERGE_BLOCKED | VERIFICATION_REQUIRED - 502 UPSTREAM_UNREACHABLE - 501 NOT_IMPLEMENTED - 500 INTERNAL.
// Successful responses are the bare object or { items: T[] }.

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'STALE_REVISION'
  | 'MERGE_BLOCKED'
  | 'VERIFICATION_REQUIRED'
  | 'UPSTREAM_UNREACHABLE'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL';

export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown; requestId: string };
}

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  STALE_REVISION: 409,
  MERGE_BLOCKED: 409,
  VERIFICATION_REQUIRED: 409,
  UPSTREAM_UNREACHABLE: 502,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};

/** Error type every server module throws; the global handler renders it as ApiError JSON. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = ERROR_HTTP_STATUS[code];
    this.details = details;
  }

  toApiError(requestId: string): ApiError {
    const error: ApiError['error'] = { code: this.code, message: this.message, requestId };
    if (this.details !== undefined) error.details = this.details;
    return { error };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Shape guard used by the web client and tests (PLAN 11.11). */
export function isApiError(body: unknown): body is ApiError {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const err = (body as { error: unknown }).error;
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { message?: unknown }).message === 'string' &&
    typeof (err as { requestId?: unknown }).requestId === 'string'
  );
}
