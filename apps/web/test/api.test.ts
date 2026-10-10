// apps/web/test/api.test.ts (owner: Dev D)
// Unit tests for the control-plane client: header injection, ApiError parsing,
// non-JSON and network failures, and request shapes (PLAN 13.6).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiClientError, isApiClientError } from '../src/api.js';
import { setCurrentUserId } from '../src/user.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function headersOf(call: unknown[]): Headers {
  const init = call[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe('api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setCurrentUserId(null);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setCurrentUserId(null);
  });

  it('sends the X-Patchwork-User header for the selected user', async () => {
    setCurrentUserId('usr_dev1');
    fetchMock.mockResolvedValue(
      jsonResponse({ items: [{ id: 'usr_dev1', name: 'Developer 1', role: 'developer' }] }),
    );

    const res = await api.users();

    expect(res.items[0]?.name).toBe('Developer 1');
    expect(headersOf(fetchMock.mock.calls[0] as unknown[]).get('x-patchwork-user')).toBe('usr_dev1');
  });

  it('omits the header when no user is selected', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    await api.projects();
    expect(headersOf(fetchMock.mock.calls[0] as unknown[]).get('x-patchwork-user')).toBeNull();
  });

  it('turns an ApiError response into an ApiClientError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'NOT_IMPLEMENTED', message: 'Patch routes arrive in step 12.', requestId: 'req_42' } },
        501,
      ),
    );

    const err = await api.patches('prj_shoplite').catch((e: unknown) => e);

    expect(isApiClientError(err)).toBe(true);
    if (!isApiClientError(err)) throw new Error('unreachable');
    expect(err.code).toBe('NOT_IMPLEMENTED');
    expect(err.message).toBe('Patch routes arrive in step 12.');
    expect(err.requestId).toBe('req_42');
    expect(err.status).toBe(501);
  });

  it('keeps 409 MERGE_BLOCKED details so the UI can show the conflict report', async () => {
    const report = { conflicts: [{ id: 'c1', type: 'SAME_PROPERTY' }], blocking: true };
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'MERGE_BLOCKED', message: 'A blocking conflict stops the merge.', requestId: 'req_7', details: report } },
        409,
      ),
    );

    const err = await api.mergePatch('pat_1', { choices: [] }).catch((e: unknown) => e);

    if (!isApiClientError(err)) throw new Error('unreachable');
    expect(err.code).toBe('MERGE_BLOCKED');
    expect(err.details).toEqual(report);
  });

  it('reports a non-JSON failure body as BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }),
    );

    const err = await api.projects().catch((e: unknown) => e);

    if (!isApiClientError(err)) throw new Error('unreachable');
    expect(err.code).toBe('BAD_RESPONSE');
    expect(err.status).toBe(502);
  });

  it('reports a network failure as NETWORK with the failing path', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const err = await api.auditVerify('prj_shoplite').catch((e: unknown) => e);

    if (!isApiClientError(err)) throw new Error('unreachable');
    expect(err.code).toBe('NETWORK');
    expect(err.message).toContain('/api/projects/prj_shoplite/audit/verify');
  });

  it('posts JSON bodies to the frozen contract paths', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'pat_new' }));

    await api.createPatch('prj_shoplite', { title: 'Fix checkout', urlPath: '/cart' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/projects/prj_shoplite/patches');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ title: 'Fix checkout', urlPath: '/cart' });
    expect(headersOf(fetchMock.mock.calls[0] as unknown[]).get('content-type')).toBe('application/json');
  });

  it('wraps a rejected ApiClientError-free throw into a real Error subclass', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'FORBIDDEN', message: 'Unknown user.', requestId: 'r' } }, 403));
    const err = await api.users().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toBeInstanceOf(Error);
  });
});
