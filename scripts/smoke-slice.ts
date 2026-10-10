// scripts/smoke-slice.ts (owner: Dev A) - slice gate (PLAN 11.18), HTTP only.
// Needs running servers: `npm run target` and `npx tsx apps/server/src/main.ts`
// (after `npm run reset && npm run build:runtime`).
// Part 1 (solo Phase 1): gateway injection, live/preview manifests, audit chain.
export {};

const CONTROL = process.env.PW_SMOKE_CONTROL ?? 'http://localhost:4000';
const LIVE = process.env.PW_SMOKE_LIVE ?? 'http://localhost:4100';
const PREVIEW = process.env.PW_SMOKE_PREVIEW ?? 'http://localhost:4300';
const PROJECT = process.env.PW_PROJECT_ID ?? 'prj_shoplite';
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

try {
  await part1();
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
