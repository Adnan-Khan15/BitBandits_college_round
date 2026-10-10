// apps/server/src/core/http.ts (owner: Dev A)
// Shared ApiError rendering for every Fastify instance (PLAN 11.11): the control
// plane (:4000), the live gateway (:4100) and the preview gateway (:4300) all
// install this so errors are one shape everywhere. Route modules just throw
// AppError (or a ZodError); this converts it.
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError, isAppError } from '@patchwork/shared';

/**
 * Install the shared HTTP conventions on a Fastify instance:
 *  - `x-request-id` response header (the id the ApiError carries),
 *  - error handler: AppError and ZodError -> ApiError JSON, anything else -> 500 INTERNAL,
 *  - not-found handler: 404 NOT_FOUND in the ApiError shape.
 *
 * Safe to call on every instance exactly once. The control plane keeps its own
 * control-only hooks (identity) in app.ts, on top of this.
 */
export function installApiErrorHandling(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.setErrorHandler((err, req, reply) => {
    const requestId = String(req.id);
    if (isAppError(err)) {
      return reply.status(err.httpStatus).send(err.toApiError(requestId));
    }
    if (err instanceof ZodError) {
      const appErr = new AppError('VALIDATION_FAILED', 'Request failed validation', err.issues);
      return reply.status(appErr.httpStatus).send(appErr.toApiError(requestId));
    }
    req.log.error(err);
    const internal = new AppError('INTERNAL', 'Internal server error');
    return reply.status(500).send(internal.toApiError(requestId));
  });

  app.setNotFoundHandler((req, reply) => {
    const notFound = new AppError('NOT_FOUND', `No route for ${req.method} ${req.url}`);
    reply.status(404).send(notFound.toApiError(String(req.id)));
  });
}
