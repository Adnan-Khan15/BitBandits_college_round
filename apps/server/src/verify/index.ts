// apps/server/src/verify/index.ts (owner: Dev C) - PLAN 11.7, 13.5 step 4 (solo 3-hour version).
// One shared Chromium, one run at a time. Release/preview subject: baseline = live, candidate =
// subject, each in its own browser context entered through /__patchwork/preview/:id. Records patch
// application, runs every patch's checks, diffs console errors, and pixel-diffs full-page
// screenshots (whole page, reported as `warn`, never blocks). Live subject: :4100 only, no visual;
// console errors are compared with the bare upstream page instead.
import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import {
  AppError,
  LAYOUT_CHANGING_OPS,
  LAYOUT_STYLE_PROPS,
  USER_HEADER,
  verificationRequestSchema,
} from '@patchwork/shared';
import type {
  FrozenPatch,
  Id,
  Preview,
  PreviewSpec,
  RuntimePatchStatus,
  ServiceRegistry,
  StepResult,
  VerificationRun,
  VerificationStep,
  VerificationSubject,
  VerifyService,
  VisualResult,
} from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';
import { loadEnv, type Env } from '../env.js';

const READY_TIMEOUT_MS = 10_000;
const STEP_TIMEOUT_MS = 5_000;
const PIXEL_THRESHOLD = 0.1;
const VIEWPORT = { width: 1280, height: 800 };
const NO_ANIMATIONS_CSS =
  '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';

type RunResult = Pick<VerificationRun, 'patchApplication' | 'steps' | 'visual' | 'newConsoleErrors' | 'summary'>;

interface RunRow {
  id: string;
  project_id: string;
  subject_json: string;
  status: string;
  result_json: string;
  started_at: string;
  finished_at: string | null;
}

const EMPTY_RESULT: RunResult = { patchApplication: [], steps: [], visual: [], newConsoleErrors: [], summary: 'queued' };

function rowToRun(r: RunRow): VerificationRun {
  const result = JSON.parse(r.result_json) as RunResult;
  return {
    id: r.id,
    projectId: r.project_id,
    subject: JSON.parse(r.subject_json) as VerificationSubject,
    status: r.status as VerificationRun['status'],
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    ...result,
  };
}

function pathMatches(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (pattern.endsWith('/*')) return path.startsWith(pattern.slice(0, -1));
  return false;
}

const slugOf = (path: string): string => path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';

const isLayoutChanging = (patches: FrozenPatch[]): boolean =>
  patches.some((p) =>
    p.ops.some(
      (op) =>
        (LAYOUT_CHANGING_OPS as readonly string[]).includes(op.kind) ||
        (op.kind === 'setStyle' && (LAYOUT_STYLE_PROPS as readonly string[]).includes(op.property)),
    ),
  );

/** Collects console errors and uncaught page errors of every page in a context. */
function captureErrors(context: BrowserContext): string[] {
  const errors: string[] = [];
  context.on('page', (page) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  });
  return errors;
}

async function waitReady(page: Page): Promise<RuntimePatchStatus[]> {
  await page.waitForFunction(
    () => (window as unknown as { __PATCHWORK__?: { status?: { ready?: boolean } } }).__PATCHWORK__?.status?.ready === true,
    undefined,
    { timeout: READY_TIMEOUT_MS },
  );
  return page.evaluate(
    () => (window as unknown as { __PATCHWORK__: { status: { patches: RuntimePatchStatus[] } } }).__PATCHWORK__.status.patches,
  );
}

/** pixelmatch's YIQ colour distance, computed on a canvas in Chromium (no extra npm packages). */
async function pixelDiff(
  browser: Browser,
  a: Buffer,
  b: Buffer,
): Promise<{ diffPixels: number; totalPixels: number; png: Buffer; heightsDiffer: boolean }> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    // tsx/esbuild (keepNames) wraps named inner functions in __name(); give the page a no-op one.
    await page.evaluate('globalThis.__name = (fn) => fn');
    const out = await page.evaluate(
      async ({ a64, b64, threshold }) => {
        const load = (src: string) =>
          new Promise<HTMLImageElement>((ok, fail) => {
            const img = new Image();
            img.onload = () => ok(img);
            img.onerror = () => fail(new Error('image decode failed'));
            img.src = src;
          });
        const [ia, ib] = await Promise.all([load(`data:image/png;base64,${a64}`), load(`data:image/png;base64,${b64}`)]);
        const w = Math.max(ia.width, ib.width);
        const h = Math.max(ia.height, ib.height);
        const pixels = (img: HTMLImageElement) => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const x = c.getContext('2d')!;
          x.fillStyle = '#ffffff'; // pad the shorter page with white
          x.fillRect(0, 0, w, h);
          x.drawImage(img, 0, 0);
          return x.getImageData(0, 0, w, h).data;
        };
        const pa = pixels(ia);
        const pb = pixels(ib);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        const outData = ctx.createImageData(w, h);
        const maxDelta = 35215 * threshold * threshold;
        const y = (r: number, g: number, bl: number) => r * 0.29889531 + g * 0.58662247 + bl * 0.11448223;
        const i_ = (r: number, g: number, bl: number) => r * 0.59597799 - g * 0.2741761 - bl * 0.32180189;
        const q = (r: number, g: number, bl: number) => r * 0.21147017 - g * 0.52261711 + bl * 0.31114694;
        let diff = 0;
        for (let k = 0; k < pa.length; k += 4) {
          const [r1, g1, b1] = [pa[k]!, pa[k + 1]!, pa[k + 2]!];
          const [r2, g2, b2] = [pb[k]!, pb[k + 1]!, pb[k + 2]!];
          const dy = y(r1, g1, b1) - y(r2, g2, b2);
          const di = i_(r1, g1, b1) - i_(r2, g2, b2);
          const dq = q(r1, g1, b1) - q(r2, g2, b2);
          const delta = 0.5053 * dy * dy + 0.299 * di * di + 0.1957 * dq * dq;
          if (delta > maxDelta) {
            diff++;
            outData.data.set([255, 0, 0, 255], k);
          } else {
            const gray = 255 - 0.1 * (255 - y(r1, g1, b1)); // faded baseline, like pixelmatch alpha 0.1
            outData.data.set([gray, gray, gray, 255], k);
          }
        }
        ctx.putImageData(outData, 0, 0);
        return { diff, total: w * h, png: canvas.toDataURL('image/png').split(',')[1]!, differ: ia.height !== ib.height };
      },
      { a64: a.toString('base64'), b64: b.toString('base64'), threshold: PIXEL_THRESHOLD },
    );
    return { diffPixels: out.diff, totalPixels: out.total, png: Buffer.from(out.png, 'base64'), heightsDiffer: out.differ };
  } finally {
    await context.close();
  }
}

export interface VerifyServiceExt extends VerifyService {
  /** Resolves when the run finishes (used by releases to flip verifying -> verified/failed). */
  wait(id: Id): Promise<VerificationRun>;
}

export function createVerifyService(db: Db, registry: ServiceRegistry, env: Env = loadEnv()): VerifyServiceExt {
  const artifactsDir = resolve(env.PW_ARTIFACTS_DIR);
  const liveOrigin = `http://localhost:${env.PW_LIVE_PORT}`;
  const previewOrigin = env.PW_PREVIEW_ORIGIN;

  let browserPromise: Promise<Browser> | null = null;
  const browser = async (): Promise<Browser> => {
    if (browserPromise) {
      const b = await browserPromise.catch(() => null);
      if (b?.isConnected()) return b;
    }
    browserPromise = chromium.launch();
    return browserPromise;
  };

  let queue: Promise<unknown> = Promise.resolve();
  const jobs = new Map<Id, Promise<VerificationRun>>();

  const get = (id: Id): VerificationRun | null => {
    const row = db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(id) as unknown as RunRow | undefined;
    return row ? rowToRun(row) : null;
  };

  const save = (id: Id, status: VerificationRun['status'], result: RunResult, finished: boolean): VerificationRun => {
    db.prepare('UPDATE verification_runs SET status = ?, result_json = ?, finished_at = ? WHERE id = ?').run(
      status,
      JSON.stringify(result),
      finished ? new Date().toISOString() : null,
      id,
    );
    return get(id)!;
  };

  const artifact = async (name: string, png: Buffer): Promise<string> => {
    mkdirSync(artifactsDir, { recursive: true });
    await writeFile(join(artifactsDir, name), png);
    return name;
  };

  /** Runs one patch's checks in the candidate context, from a fresh load of its page. */
  const runChecks = async (
    runId: Id,
    context: BrowserContext,
    origin: string,
    path: string,
    patch: FrozenPatch,
  ): Promise<StepResult[]> => {
    const results: StepResult[] = [];
    const page = await context.newPage();
    try {
      await page.goto(`${origin}${path}`);
      const statuses = await waitReady(page);
      const status = statuses.find((s) => s.patchId === patch.patchId);
      const target = (t: string): string => {
        if (!t.startsWith('anchor:')) return t;
        const key = t.slice('anchor:'.length);
        const res = status?.resolutions.find((r) => r.anchorId === key);
        if (!res?.elementPath) throw new Error(`anchor "${key}" did not resolve on ${path}`);
        return res.elementPath;
      };
      for (const [index, step] of patch.checks.entries()) {
        const started = Date.now();
        let error: string | null = null;
        try {
          await runStep(page, origin, step, target);
        } catch (err) {
          error = (err instanceof Error ? err.message : String(err)).split('\n')[0]!.slice(0, 300);
        }
        let screenshot: string | null = null;
        if (error) {
          screenshot = await page
            .screenshot({ fullPage: true })
            .then((png) => artifact(`${runId}-${slugOf(patch.patchId)}-step${index}.png`, png))
            .catch(() => null);
        }
        results.push({ patchId: patch.patchId, index, step, ok: error === null, error, screenshot, durationMs: Date.now() - started });
        if (error) break; // later steps of this patch depend on the failed one
      }
    } finally {
      await page.close();
    }
    return results;
  };

  const runStep = async (
    page: Page,
    origin: string,
    step: VerificationStep,
    target: (t: string) => string,
  ): Promise<void> => {
    const timeout = STEP_TIMEOUT_MS;
    switch (step.action) {
      case 'goto':
        await page.goto(`${origin}${step.path}`, { timeout });
        await waitReady(page);
        return;
      case 'click':
        await page.click(target(step.target), { timeout });
        return;
      case 'fill':
        await page.fill(target(step.target), step.value, { timeout });
        return;
      case 'expectText': {
        const sel = target(step.target);
        await page.waitForFunction(
          ([s, c]) => (document.querySelector(s!)?.textContent ?? '').includes(c!),
          [sel, step.contains],
          { timeout },
        );
        return;
      }
      case 'expectVisible':
        await page.waitForSelector(target(step.target), { state: 'visible', timeout });
        return;
      case 'expectHidden':
        await page.waitForSelector(target(step.target), { state: 'hidden', timeout });
        return;
      case 'expectUrl':
        await page.waitForURL((u) => u.href.includes(step.contains), { timeout });
        return;
    }
  };

  const execute = async (run: VerificationRun, actorId: Id): Promise<VerificationRun> => {
    const projectId = run.projectId;
    save(run.id, 'running', { ...EMPTY_RESULT, summary: 'running' }, false);
    const contexts: BrowserContext[] = [];
    try {
      const project = registry.core.getProject(projectId);
      if (!project) throw new AppError('NOT_FOUND', `No project ${projectId}`);
      const subject = run.subject;
      const spec = (base: PreviewSpec['base']): PreviewSpec => ({ base, include: [], exclude: [], draft: null, resolverMode: 'smart' });

      // Who is compared with what.
      let patches: FrozenPatch[];
      let candidatePreview: Preview | null = null;
      let baselinePreview: Preview | null = null;
      if (subject.kind === 'release') {
        const release = registry.releases.get(subject.releaseId);
        if (!release) throw new AppError('NOT_FOUND', `No release ${subject.releaseId}`);
        patches = release.patches;
        candidatePreview = registry.core.createPreview(projectId, spec({ releaseId: release.id }), actorId);
        baselinePreview = registry.core.createPreview(projectId, spec('live'), actorId);
      } else if (subject.kind === 'preview') {
        candidatePreview = registry.core.getPreview(subject.previewId);
        if (!candidatePreview) throw new AppError('NOT_FOUND', `No preview ${subject.previewId}`);
        patches = registry.core.manifestForPreview(candidatePreview.id).patches;
        baselinePreview = registry.core.createPreview(projectId, spec('live'), actorId);
      } else {
        patches = registry.releases.manifestForLive(projectId).patches;
      }

      const paths = [
        ...new Set(
          patches.flatMap((p) =>
            p.urlPath.endsWith('/*') ? project.paths.filter((path) => pathMatches(p.urlPath, path)) : [p.urlPath],
          ),
        ),
      ];
      if (paths.length === 0) {
        return save(run.id, 'passed', { ...EMPTY_RESULT, summary: 'passed: no patches to verify' }, true);
      }

      const b = await browser();
      const newContext = async (): Promise<{ context: BrowserContext; errors: string[] }> => {
        const context = await b.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
        contexts.push(context);
        return { context, errors: captureErrors(context) };
      };
      const candidate = await newContext();
      const baseline = await newContext();
      const candidateOrigin = candidatePreview ? previewOrigin : liveOrigin;
      const baselineOrigin = baselinePreview ? previewOrigin : project.upstreamOrigin;

      const visit = async (
        ctx: BrowserContext,
        preview: Preview | null,
        origin: string,
        path: string,
        withRuntime: boolean,
      ): Promise<{ statuses: RuntimePatchStatus[]; png: Buffer }> => {
        const page = await ctx.newPage();
        try {
          const url = preview
            ? `${origin}/__patchwork/preview/${preview.id}?path=${encodeURIComponent(path)}`
            : `${origin}${path}`;
          await page.goto(url);
          await page.addStyleTag({ content: NO_ANIMATIONS_CSS });
          const statuses = withRuntime ? await waitReady(page) : [];
          await page.waitForLoadState('networkidle').catch(() => undefined);
          return { statuses, png: await page.screenshot({ fullPage: true }) };
        } finally {
          await page.close();
        }
      };

      const application = new Map<Id, RuntimePatchStatus>();
      const visual: VisualResult[] = [];
      const layoutChanging = isLayoutChanging(patches);
      for (const path of paths) {
        const cand = await visit(candidate.context, candidatePreview, candidateOrigin, path, true);
        for (const s of cand.statuses) {
          const own = patches.find((p) => p.patchId === s.patchId);
          if (own && pathMatches(own.urlPath, path)) application.set(s.patchId, s);
          else if (!application.has(s.patchId)) application.set(s.patchId, s);
        }
        const base = await visit(baseline.context, baselinePreview, baselineOrigin, path, baselinePreview !== null);
        if (subject.kind === 'live') continue; // live: console comparison only, no visual
        const diff = await pixelDiff(b, base.png, cand.png);
        const slug = slugOf(path);
        visual.push({
          path,
          baseline: await artifact(`${run.id}-${slug}-baseline.png`, base.png),
          candidate: await artifact(`${run.id}-${slug}-candidate.png`, cand.png),
          diff: await artifact(`${run.id}-${slug}-diff.png`, diff.png),
          diffPixels: diff.diffPixels,
          totalPixels: diff.totalPixels,
          outsideMaskRatio: diff.totalPixels > 0 ? diff.diffPixels / diff.totalPixels : 0, // whole page, no mask (solo cut)
          layoutChanging: layoutChanging || diff.heightsDiffer,
          outcome: diff.diffPixels > 0 ? 'warn' : 'pass',
        });
      }

      const steps: StepResult[] = [];
      for (const patch of patches) {
        if (patch.checks.length === 0) continue;
        const path = paths.find((p) => pathMatches(patch.urlPath, p));
        if (!path) continue;
        steps.push(...(await runChecks(run.id, candidate.context, candidateOrigin, path, patch)));
      }

      const baselineErrors = new Set(baseline.errors);
      const newConsoleErrors = [...new Set(candidate.errors.filter((e) => !baselineErrors.has(e)))];
      const patchApplication = patches.map(
        (p) =>
          application.get(p.patchId) ?? {
            patchId: p.patchId,
            revision: p.revision,
            applied: false,
            reason: 'anchor_not_found' as const,
            resolutions: [],
            affectedRects: [],
            error: 'no runtime status reported for this patch',
          },
      );
      const notApplied = patchApplication.filter((s) => !s.applied && s.reason !== 'path_mismatch');
      const failedSteps = steps.filter((s) => !s.ok);
      const failed = notApplied.length > 0 || failedSteps.length > 0 || newConsoleErrors.length > 0;
      const visualWarn = visual.filter((v) => v.outcome === 'warn').map((v) => v.path);
      const summary = [
        failed ? 'failed' : 'passed',
        `${patchApplication.length - notApplied.length}/${patchApplication.length} patches applied`,
        `${steps.length - failedSteps.length}/${steps.length} check steps ok`,
        `${newConsoleErrors.length} new console error(s)`,
        subject.kind === 'live' ? 'visual skipped (live)' : visualWarn.length ? `visual diff on ${visualWarn.join(', ')} (warn)` : 'no visual diff',
      ].join('; ');
      return save(run.id, failed ? 'failed' : 'passed', { patchApplication, steps, visual, newConsoleErrors, summary }, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return save(run.id, 'error', { ...EMPTY_RESULT, summary: `error: ${message.slice(0, 500)}` }, true);
    } finally {
      await Promise.allSettled(contexts.map((c) => c.close()));
      const finished = get(run.id);
      if (finished) {
        registry.audit.append({
          projectId,
          type: 'verification.finished',
          actorId,
          subject: { type: 'verification', id: run.id },
          data: { subject: run.subject, status: finished.status, summary: finished.summary },
        });
      }
    }
  };

  const start = (projectId: Id, subject: VerificationSubject, actorId: Id): VerificationRun => {
    if (!registry.core.getProject(projectId)) throw new AppError('NOT_FOUND', `No project ${projectId}`);
    const id = `ver_${nanoid(12)}`;
    db.prepare(
      `INSERT INTO verification_runs (id, project_id, subject_json, status, result_json, started_at, finished_at)
       VALUES (?, ?, ?, 'queued', ?, ?, NULL)`,
    ).run(id, projectId, JSON.stringify(subject), JSON.stringify(EMPTY_RESULT), new Date().toISOString());
    const run = get(id)!;
    const job = queue.then(() => execute(run, actorId));
    queue = job.catch(() => undefined);
    jobs.set(id, job);
    void job.finally(() => jobs.delete(id));
    return run;
  };

  return {
    start,
    async runToCompletion(projectId, subject, actorId) {
      const run = start(projectId, subject, actorId);
      return jobs.get(run.id) ?? get(run.id)!;
    },
    get,
    async wait(id) {
      const job = jobs.get(id);
      if (job) return job;
      const run = get(id);
      if (!run) throw new AppError('NOT_FOUND', `No verification ${id}`);
      return run;
    },
  };
}

export function registerVerifyRoutes(app: FastifyInstance, registry: ServiceRegistry, env: Env = loadEnv()): void {
  const artifactsDir = resolve(env.PW_ARTIFACTS_DIR);

  app.post('/api/projects/:pid/verifications', async (req) => {
    const { pid } = req.params as { pid: string };
    const actor = req.headers[USER_HEADER];
    if (typeof actor !== 'string' || actor === '') throw new AppError('FORBIDDEN', `Send ${USER_HEADER}`);
    const { subject } = verificationRequestSchema.parse(req.body ?? {});
    return registry.verify.start(pid, subject, actor);
  });

  app.get('/api/verifications/:id', async (req) => {
    const { id } = req.params as { id: string };
    const run = registry.verify.get(id);
    if (!run) throw new AppError('NOT_FOUND', `No verification ${id}`);
    return run;
  });

  app.get('/api/artifacts/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    if (file.includes('/') || file.includes('\\') || file.includes('..') || !file.endsWith('.png')) {
      throw new AppError('VALIDATION_FAILED', 'Bad artifact name');
    }
    let png: Buffer;
    try {
      png = await readFile(join(artifactsDir, file));
    } catch {
      throw new AppError('NOT_FOUND', `No artifact ${file}`);
    }
    return reply.type('image/png').header('cache-control', 'no-store').send(png);
  });
}
