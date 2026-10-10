// packages/runtime/test/runtime.pw.ts (owner: Dev B)
// Browser smoke test for the built runtime bundle (PLAN section 11.6 /
// acceptance "preview can be switched to selector-only mode"): inject the real IIFE
// bundle into a page, serve a manifest, and prove it applies an exact patch, skips a
// path mismatch, and refuses an anchor that only the stored CSS selector would miss.
// Run: npx playwright test --config packages/runtime/playwright.config.ts
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const dist = join(pkgRoot, 'dist', 'patchwork-runtime.js');
const THRESHOLDS = { exact: 0.9, relocate: 0.65, margin: 0.15 };

test.beforeAll(() => {
  execFileSync('node', [join(pkgRoot, 'build.mjs')], { cwd: pkgRoot, stdio: 'inherit' });
});

const HTML = `<!doctype html><html><head><title>smoke</title></head><body>
  <div id="title">Old</div>
  <p class="note">keep me</p>
</body></html>`;

const HTML_RENAMED = `<!doctype html><html><head><title>smoke</title></head><body>
  <div id="renamed">Old</div>
  <p class="note">keep me</p>
</body></html>`;

function fingerprint(id: string, cssPath: string) {
  return {
    v: 1,
    tag: 'div',
    id,
    testId: null,
    name: null,
    classes: [],
    text: 'Old',
    accessibleName: null,
    role: null,
    attrs: {},
    cssPath,
    xpath: '/html/body/div[1]',
    ancestors: [
      { tag: 'body', id: null, classes: [] },
      { tag: 'html', id: null, classes: [] },
    ],
    siblingIndex: 0,
    neighborText: 'keep me',
    rect: null,
    capturedAt: '2026-01-01T00:00:00.000Z',
    capturedFromHash: 'runtime',
  };
}

function manifest(opts: { resolverMode: 'smart' | 'selector'; anchorId: string; cssPath: string }) {
  return {
    channel: 'preview',
    projectId: 'prj_smoke',
    releaseId: 'rel_smoke',
    previewId: 'prv_smoke',
    resolverMode: opts.resolverMode,
    patches: [
      {
        patchId: 'pat_smoke',
        revision: 1,
        title: 'set title',
        urlPath: '/',
        anchors: { a: fingerprint(opts.anchorId, opts.cssPath) },
        ops: [{ kind: 'setText', target: { anchor: 'a' }, value: 'New' }],
        checks: [],
        baseSnapshotId: null,
        baseValues: {},
      },
      {
        patchId: 'pat_skip',
        revision: 1,
        title: 'other page',
        urlPath: '/somewhere-else',
        anchors: { a: fingerprint(opts.anchorId, opts.cssPath) },
        ops: [{ kind: 'setText', target: { anchor: 'a' }, value: 'Nope' }],
        checks: [],
        baseSnapshotId: null,
        baseValues: {},
      },
    ],
    editor: { enabled: false, allowedOrigin: null },
    beaconUrl: '/__patchwork/beacon',
    thresholds: THRESHOLDS,
  };
}

async function serve(
  page: import('@playwright/test').Page,
  html: string,
  body: Record<string, unknown>,
): Promise<void> {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__patchwork/manifest.json') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (route.request().resourceType() === 'document') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    }
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto('http://patchwork-smoke.local/');
  await page.addScriptTag({ path: dist });
  await page.waitForFunction(() => (window as { __PATCHWORK__?: { status: { ready: boolean } } }).__PATCHWORK__?.status.ready === true);
}

test('smart runtime applies an exact patch and skips a path mismatch', async ({ page }) => {
  await serve(page, HTML, manifest({ resolverMode: 'smart', anchorId: 'title', cssPath: '#title' }));

  const status = await page.evaluate(() => (window as { __PATCHWORK__: { status: unknown } }).__PATCHWORK__.status);
  expect(status).toMatchObject({
    ready: true,
    patches: [
      { patchId: 'pat_smoke', applied: true, reason: 'ok' },
      { patchId: 'pat_skip', applied: false, reason: 'path_mismatch' },
    ],
  });
  await expect(page.locator('#title')).toHaveText('New');
  await expect(page.locator('[data-pw-badge]')).toHaveCount(1);
});

test('selector-only mode refuses a patch the saved selector can no longer find', async ({ page }) => {
  await serve(page, HTML_RENAMED, manifest({ resolverMode: 'selector', anchorId: 'title', cssPath: '#title' }));

  const status = await page.evaluate(() => (window as { __PATCHWORK__: { status: unknown } }).__PATCHWORK__.status);
  expect(status).toMatchObject({
    patches: [
      { patchId: 'pat_smoke', applied: false, reason: 'anchor_not_found' },
      { patchId: 'pat_skip', applied: false, reason: 'path_mismatch' },
    ],
  });
  await expect(page.locator('#renamed')).toHaveText('Old');
});
