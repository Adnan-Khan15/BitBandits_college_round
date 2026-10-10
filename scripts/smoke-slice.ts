// scripts/smoke-slice.ts (owner: Dev A) - slice gate (PLAN 11.18), HTTP only.
// Needs running servers: `npm run target` and `npx tsx apps/server/src/main.ts`
// (after `npm run reset && npm run build:runtime`).
// Part 1 (solo Phase 1): gateway injection, live/preview manifests, audit chain.
// Part 2 (fresh `npm run reset`): patch -> isolated preview -> review -> merge -> R1 ->
// unverified deploy refused -> verify -> deploy -> conflicting patch blocked (409) ->
// candidate_overrides -> rollback to none -> audit valid. Rendered text is read with headless
// Chromium because the runtime applies patches in the browser, not in the proxied HTML.
import { chromium, type Browser } from 'playwright';
import { captureFingerprint } from '../packages/engine/src/index.js';
import { documentFromHtml } from '../packages/engine/src/node.js';

const CONTROL = process.env.PW_SMOKE_CONTROL ?? 'http://localhost:4000';
const LIVE = process.env.PW_SMOKE_LIVE ?? 'http://localhost:4100';
const PREVIEW = process.env.PW_SMOKE_PREVIEW ?? 'http://localhost:4300';
const PROJECT = process.env.PW_PROJECT_ID ?? 'prj_shoplite';
const TARGET = process.env.PW_SMOKE_TARGET ?? 'http://localhost:4200';
const RUNTIME_SRC = '/__patchwork/runtime.js';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function get(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { redirect: 'manual' });
  return { status: res.status, text: await res.text() };
}

async function part1(): Promise<void> {
  console.log('--- part 1: gateway + audit');
  for (const [label, origin] of [
    ['live', LIVE],
    ['preview', PREVIEW],
  ] as const) {
    const page = await get(`${origin}/cart`);
    check(
      `${label} /cart is proxied with the runtime script injected`,
      page.status === 200 && page.text.includes(RUNTIME_SRC) && page.text.includes('ShopLite'),
      `status ${page.status}`,
    );
    const runtime = await get(`${origin}${RUNTIME_SRC}`);
    check(`${label} ${RUNTIME_SRC} is served`, runtime.status === 200 && runtime.text.length > 1000, `status ${runtime.status}`);
  }

  const liveManifest = await get(`${LIVE}/__patchwork/manifest.json`);
  let livePatches: unknown = null;
  try {
    livePatches = (JSON.parse(liveManifest.text) as { patches?: unknown }).patches;
  } catch {
    /* reported below */
  }
  check(
    'live manifest is 200 with patches: []',
    liveManifest.status === 200 && Array.isArray(livePatches) && livePatches.length === 0,
    `status ${liveManifest.status}`,
  );

  const previewManifest = await get(`${PREVIEW}/__patchwork/manifest.json`);
  check('preview manifest without cookie is 404', previewManifest.status === 404, `status ${previewManifest.status}`);

  const verify = await get(`${CONTROL}/api/projects/${PROJECT}/audit/verify`);
  let valid: unknown = null;
  try {
    valid = (JSON.parse(verify.text) as { valid?: unknown }).valid;
  } catch {
    /* reported below */
  }
  check('audit chain verifies', verify.status === 200 && valid === true, `status ${verify.status}, body ${verify.text}`);
}


interface ApiResult<T = Record<string, unknown>> {
  status: number;
  body: T;
}

async function api<T = Record<string, unknown>>(
  method: string,
  path: string,
  user: string | null,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (user) headers['x-patchwork-user'] = user;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${CONTROL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T };
}

function must<T>(name: string, r: ApiResult<T>, status = 200): T {
  const ok = r.status === status;
  check(name, ok, ok ? '' : `status ${r.status}, body ${JSON.stringify(r.body).slice(0, 300)}`);
  if (!ok) throw new Error(`${name} failed`);
  return r.body;
}

/** Text of the first `selector` after the runtime reports ready (fresh context = fresh cookies). */
async function renderedText(browser: Browser, url: string, selector: string): Promise<string> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(
      () => (window as unknown as { __PATCHWORK__?: { status?: { ready?: boolean } } }).__PATCHWORK__?.status?.ready === true,
      undefined,
      { timeout: 10_000 },
    );
    return ((await page.textContent(selector)) ?? '').trim();
  } finally {
    await context.close();
  }
}

async function livePatchCount(): Promise<number> {
  const m = (await (await fetch(`${LIVE}/__patchwork/manifest.json`)).json()) as { patches: unknown[] };
  return m.patches.length;
}

async function part2(): Promise<void> {
  console.log('--- part 2: patch -> preview -> review -> merge -> release -> deploy -> conflict -> rollback');
  const SELECTOR = 'h1.page-title';
  const TEXT_A = 'Smoke slice: headline from patch A';
  const TEXT_B = 'Smoke slice: headline from patch B';

  const html = await (await fetch(`${TARGET}/`)).text();
  const { document } = documentFromHtml(html, `${TARGET}/`);
  const el = document.querySelector(SELECTOR);
  if (!el) throw new Error(`${SELECTOR} not found on ${TARGET}/`);
  const original = (el.textContent ?? '').trim();
  const anchor = captureFingerprint(el, { capturedFromHash: 'smoke-slice' });
  const patchBody = (title: string, value: string) => ({
    title,
    description: 'Created by scripts/smoke-slice.ts',
    urlPath: '/',
    anchors: { headline: anchor },
    ops: [{ kind: 'setText', target: { anchor: 'headline' }, value }],
    checks: [{ action: 'expectText', target: 'anchor:headline', contains: value }],
    baseSnapshotId: null,
    baseValues: { 0: original },
  });

  type Patch = { id: string; status: string; revision: number };
  const pa = must('dev1 creates patch A (setText on /)', await api<Patch>('POST', `/api/projects/${PROJECT}/patches`, 'usr_dev1', patchBody('Smoke A', TEXT_A)));

  const { url } = must(
    'dev1 creates a preview including patch A',
    await api<{ url: string }>('POST', `/api/projects/${PROJECT}/previews`, 'usr_dev1', {
      base: 'live',
      include: [pa.id],
      exclude: [],
      draft: null,
      resolverMode: 'smart',
    }),
  );

  const browser = await chromium.launch();
  try {
    check('preview url shows patch A on :4300', (await renderedText(browser, url, SELECTOR)) === TEXT_A, url);
    check('live :4100 still shows the original headline', (await renderedText(browser, `${LIVE}/`, SELECTOR)) === original);

    must('dev1 submits patch A', await api('POST', `/api/patches/${pa.id}/submit`, 'usr_dev1'));
    check(
      'author cannot approve own patch',
      (await api('POST', `/api/patches/${pa.id}/reviews`, 'usr_dev1', { decision: 'approve', comment: 'mine' })).status === 403,
    );
    must('reviewer approves patch A', await api('POST', `/api/patches/${pa.id}/reviews`, 'usr_rev', { decision: 'approve', comment: 'ok' }));
    must('reviewer merges patch A', await api('POST', `/api/patches/${pa.id}/merge`, 'usr_rev', { choices: [] }));

    check(
      'developer cannot create a release',
      (await api('POST', `/api/projects/${PROJECT}/releases`, 'usr_dev1', { note: 'nope' })).status === 403,
    );
    const r1 = must('release manager creates R1', await api<{ id: string; number: number; patches: unknown[] }>('POST', `/api/projects/${PROJECT}/releases`, 'usr_rm', { note: 'smoke R1' }));
    check('R1 freezes head (1 patch)', r1.patches.length === 1, `R${r1.number}`);
    check(
      'unverified R1 cannot deploy (409 VERIFICATION_REQUIRED)',
      (await api('POST', `/api/releases/${r1.id}/deploy`, 'usr_rm', { force: false, reason: '' })).status === 409,
    );
    const run = must('release manager verifies R1', await api<{ id: string }>('POST', `/api/releases/${r1.id}/verify`, 'usr_rm'));
    let verified = '';
    for (let i = 0; i < 90 && !['passed', 'failed', 'error'].includes(verified); i++) {
      await new Promise((r) => setTimeout(r, 1000));
      verified = (await api<{ status: string }>('GET', `/api/verifications/${run.id}`, null)).body.status;
    }
    check('R1 verification passed', verified === 'passed', verified);
    must('release manager deploys verified R1', await api('POST', `/api/releases/${r1.id}/deploy`, 'usr_rm', { force: false, reason: '' }));
    check('live manifest carries R1 (1 patch)', (await livePatchCount()) === 1);
    check('live :4100 now shows patch A', (await renderedText(browser, `${LIVE}/`, SELECTOR)) === TEXT_A);

    const pb = must('dev2 creates patch B on the same element', await api<Patch>('POST', `/api/projects/${PROJECT}/patches`, 'usr_dev2', patchBody('Smoke B', TEXT_B)));
    must('dev2 submits patch B', await api('POST', `/api/patches/${pb.id}/submit`, 'usr_dev2'));
    must('reviewer approves patch B', await api('POST', `/api/patches/${pb.id}/reviews`, 'usr_rev', { decision: 'approve', comment: 'ok' }));
    const blocked = await api<{ error: { code: string; details?: { conflicts: Array<{ id: string; type: string; severity: string }> } } }>(
      'POST',
      `/api/patches/${pb.id}/merge`,
      'usr_rev',
      { choices: [] },
    );
    const sameProp = blocked.body.error?.details?.conflicts.find((c) => c.type === 'SAME_PROPERTY' && c.severity === 'blocking');
    check(
      'merging patch B is blocked: 409 MERGE_BLOCKED with SAME_PROPERTY',
      blocked.status === 409 && blocked.body.error?.code === 'MERGE_BLOCKED' && sameProp !== undefined,
      `status ${blocked.status}`,
    );
    if (!sameProp) throw new Error('no SAME_PROPERTY conflict to resolve');
    must(
      'merge with candidate_overrides succeeds',
      await api('POST', `/api/patches/${pb.id}/merge`, 'usr_rev', {
        choices: [{ conflictId: sameProp.id, choice: 'candidate_overrides', note: 'B wins' }],
      }),
    );

    const dep = must('release manager rolls back to no release', await api<{ kind: string; releaseId: string }>('POST', `/api/projects/${PROJECT}/rollback`, 'usr_rm', { reason: 'smoke rollback' }));
    check('rollback deployment targets no release', dep.kind === 'rollback' && dep.releaseId === 'none', JSON.stringify(dep).slice(0, 120));
    check('live manifest is empty again', (await livePatchCount()) === 0);
    check('live :4100 shows the original headline again', (await renderedText(browser, `${LIVE}/`, SELECTOR)) === original);
  } finally {
    await browser.close();
  }

  const audit = must('audit chain verifies after the slice', await api<{ valid: boolean }>('GET', `/api/projects/${PROJECT}/audit/verify`, null));
  check('audit chain is valid', audit.valid === true);
  const events = must('audit list', await api<{ items: Array<{ type: string }> }>('GET', `/api/projects/${PROJECT}/audit`, null));
  const types = new Set(events.items.map((e) => e.type));
  const expected = ['patch.created', 'preview.created', 'patch.submitted', 'patch.reviewed', 'patch.merged', 'release.created', 'release.deployed', 'conflict.detected', 'conflict.resolved', 'release.rolled_back'];
  const missing = expected.filter((t) => !types.has(t));
  check('audit trail records every step', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${events.items.length} events`);
}

const parts = (process.argv[2] ?? '1,2').split(',');
try {
  if (parts.includes('1')) await part1();
  if (parts.includes('2')) await part2();
} catch (err) {
  console.error('[smoke:slice] aborted:', err instanceof Error ? err.message : err);
  console.error('Are the servers up? npm run target  +  npx tsx apps/server/src/main.ts');
  process.exit(1);
}

if (failures > 0) {
  console.error(`[smoke:slice] ${failures} check(s) failed`);
  process.exit(1);
}
console.log('[smoke:slice] all checks passed');
