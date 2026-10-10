// apps/server/src/core/http.test.ts (owner: Dev A)
// The shared ApiError rendering used by the control, live and preview instances.
import Fastify from 'fastify';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { AppError } from '@patchwork/shared';
import { installApiErrorHandling } from './http.js';

function bareApp() {
  const app = Fastify();
  installApiErrorHandling(app);
  return app;
}

describe('installApiErrorHandling (shared by control, live and preview)', () => {
  it('renders AppError with its mapped status, details and request id', async () => {
    const app = bareApp();
    app.get('/boom', async () => {
      throw new AppError('UPSTREAM_UNREACHABLE', 'upstream down', { url: 'http://x' });
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(502);
    const body = res.json() as {
      error: { code: string; message: string; requestId: string; details?: unknown };
    };
    expect(body.error.code).toBe('UPSTREAM_UNREACHABLE');
    expect(body.error.message).toBe('upstream down');
    expect(body.error.details).toEqual({ url: 'http://x' });
    expect(typeof body.error.requestId).toBe('string');
    // The request id on the header matches the one baked into the body (PLAN 11.11).
    expect(res.headers['x-request-id']).toBe(body.error.requestId);
    await app.close();
  });

  it('renders a ZodError as 400 VALIDATION_FAILED', async () => {
    const app = bareApp();
    app.get('/zod', async () => {
      z.object({ a: z.string() }).parse({ a: 1 });
      return {};
    });
    const res = await app.inject({ method: 'GET', url: '/zod' });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
    await app.close();
  });

  it('renders an unexpected error as 500 INTERNAL without leaking the message', async () => {
    const app = bareApp();
    app.get('/kaboom', async () => {
      throw new Error('secret internals');
    });
    const res = await app.inject({ method: 'GET', url: '/kaboom' });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.message).not.toContain('secret');
    await app.close();
  });

  it('answers unmatched routes with a 404 NOT_FOUND ApiError', async () => {
    const app = bareApp();
    const res = await app.inject({ method: 'GET', url: '/no-such-route' });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(typeof body.error.requestId).toBe('string');
    await app.close();
  });
});
