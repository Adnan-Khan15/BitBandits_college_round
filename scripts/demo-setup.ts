// scripts/demo-setup.ts (owner: Dev A) - PLAN 13.3 step 15, through the real HTTP API only.
// Needs running servers (npm run target + npm start) on a fresh `npm run reset`.
// Creates P1 "Fix checkout button", P2 "Fix price typo", P3 "Hide expired promo" (submitted,
// approved, merged), freezes R1, verifies it, deploys it and waits for its health run.
// P4 "Restyle checkout button" (pointer-events: none, same check as P1) is left approved, not merged,
// so the demo can merge it, release R2, force-deploy and watch the automatic rollback.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementFingerprint } from '@patchwork/shared';
import { captureFingerprint } from '../packages/engine/src/index.js';
import { documentFromHtml } from '../packages/engine/src/node.js';

const CONTROL = process.env.PW_DEMO_CONTROL ?? 'http://localhost:4000';
const PROJECT = process.env.PW_PROJECT_ID ?? 'prj_shoplite';
const UPSTREAM = 'http://localhost:4200';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Fingerprint of the first element matching `selector` (and `text`, if given) in a v1 fixture page. */
function anchor(file: string, path: string, selector: string, text?: string): ElementFingerprint {
  const html = readFileSync(join(repoRoot, 'fixtures', 'target-site', 'v1', file), 'utf8');
  const { document } = documentFromHtml(html, `${UPSTREAM}${path}`);
  const el = [...document.querySelectorAll(selector)].find((e) => text === undefined || (e.textContent ?? '').trim() === text);
  if (!el) throw new Error(`${selector}${text ? ` "${text}"` : ''} not found in v1/${file}`);
  return captureFingerprint(el, { capturedFromHash: 'fixture-v1' });
}

async function api<T>(method: string, path: string, user: string, body?: unknown): Promise<T> {
  const res = await fetch(`${CONTROL}${path}`, {
    method,
    headers: { 'x-patchwork-user': user, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: { code: string; message: string } };
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.error?.code}: ${json.error?.message}`);
  return json;
}

async function poll<T>(label: string, fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 90_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (done(v)) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

type Patch = { id: string; title: string; status: string };
type Release = { id: string; number: number; status: string; verificationRunId: string | null };
type Run = { id: string; status: string; summary: string };
type Deployment = { id: string; kind: string; status: string; releaseId: string };

const checkoutBtn = anchor('cart.html', '/cart', '#checkout-btn');
const checkoutCheck = [
  { action: 'click', target: 'anchor:a1' },
  { action: 'expectUrl', contains: '/checkout' },
];

const PATCHES = [
  {
    key: 'P1',
    author: 'usr_dev1',
    title: 'Fix checkout button',
    description: 'The checkout button calls an undefined startChekout(); send shoppers to /checkout instead.',
    urlPath: '/cart',
    anchors: { a1: checkoutBtn },
    ops: [{ kind: 'setBehavior', target: { anchor: 'a1' }, event: 'click', mode: 'replace', action: { type: 'navigate', url: '/checkout' } }],
    checks: checkoutCheck,
    baseValues: {},
    merge: true,
  },
  {
    key: 'P2',
    author: 'usr_dev1',
    title: 'Fix price typo',
    description: 'USB-C Hub shows ₹12,99; the real price is ₹1,299.',
    urlPath: '/',
    anchors: { a1: anchor('index.html', '/', 'p.price', '₹12,99') },
    ops: [{ kind: 'setText', target: { anchor: 'a1' }, value: '₹1,299' }],
    checks: [{ action: 'expectText', target: 'anchor:a1', contains: '₹1,299' }],
    baseValues: { 0: '₹12,99' },
    merge: true,
  },
  {
    key: 'P3',
    author: 'usr_dev2',
    title: 'Hide expired promo',
    description: 'The Diwali sale banner ended on 31 Oct 2025.',
    urlPath: '/',
    anchors: { a1: anchor('index.html', '/', '#promo-banner') },
    ops: [{ kind: 'hide', target: { anchor: 'a1' } }],
    checks: [{ action: 'expectHidden', target: 'anchor:a1' }],
    baseValues: {},
    merge: true,
  },
  {
    key: 'P4',
    author: 'usr_dev2',
    title: 'Restyle checkout button',
    description: 'Demo regression: pointer-events: none makes the checkout button unclickable.',
    urlPath: '/cart',
    anchors: { a1: checkoutBtn },
    ops: [{ kind: 'setStyle', target: { anchor: 'a1' }, property: 'pointer-events', value: 'none' }],
    checks: checkoutCheck,
    baseValues: {},
    merge: false,
  },
];

const existing = await api<{ items: Patch[] }>('GET', `/api/projects/${PROJECT}/patches`, 'usr_rev');
if (existing.items.length > 0) {
  console.error(`[demo:setup] ${PROJECT} already has ${existing.items.length} patches. Run \`npm run reset\` first.`);
  process.exit(1);
}

const created: Record<string, Patch> = {};
for (const p of PATCHES) {
  const { key, author, merge, ...body } = p;
  const patch = await api<Patch>('POST', `/api/projects/${PROJECT}/patches`, author, { ...body, baseSnapshotId: null });
  await api('POST', `/api/patches/${patch.id}/submit`, author);
  await api('POST', `/api/patches/${patch.id}/reviews`, 'usr_rev', { decision: 'approve', comment: 'Looks right.' });
  if (merge) await api('POST', `/api/patches/${patch.id}/merge`, 'usr_rev', { choices: [] });
  created[key] = patch;
  console.log(`[demo:setup] ${key} ${patch.id} "${p.title}" -> ${merge ? 'merged' : 'approved (not merged)'}`);
}

const r1 = await api<Release>('POST', `/api/projects/${PROJECT}/releases`, 'usr_rm', { note: 'R1: checkout, price typo, expired promo' });
console.log(`[demo:setup] R${r1.number} ${r1.id} created; verifying...`);
const run = await api<Run>('POST', `/api/releases/${r1.id}/verify`, 'usr_rm');
const finished = await poll(
  'R1 verification',
  () => api<Run>('GET', `/api/verifications/${run.id}`, 'usr_rm'),
  (r) => !['queued', 'running'].includes(r.status),
);
console.log(`[demo:setup] verification ${finished.status}: ${finished.summary}`);
if (finished.status !== 'passed') process.exit(1);
await poll('R1 verified', () => api<Release>('GET', `/api/releases/${r1.id}`, 'usr_rm'), (r) => r.status === 'verified', 10_000);

const dep = await api<Deployment>('POST', `/api/releases/${r1.id}/deploy`, 'usr_rm', { force: false, reason: 'Demo baseline' });
console.log(`[demo:setup] deployed R${r1.number} (${dep.id}); waiting for the health run...`);
const health = await poll(
  'R1 health',
  async () => (await api<{ items: Deployment[] }>('GET', `/api/projects/${PROJECT}/deployments`, 'usr_rm')).items.find((d) => d.id === dep.id)!,
  (d) => d.status !== 'in_progress',
);
console.log(`[demo:setup] deployment ${health.status}`);
if (health.status !== 'healthy') process.exit(1);
console.log(`[demo:setup] done. Live: http://localhost:4100/cart  ·  P4 ${created.P4!.id} is approved and waiting to be merged.`);
