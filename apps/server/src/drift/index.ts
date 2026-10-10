// apps/server/src/drift/index.ts (owner: Dev B - replaces the scaffold stub).
// Drift Sentinel (PLAN sections 6, 11.9, 11.12, 11.13): poll the upstream through the
// snapshot service, re-anchor every live patch with the engine resolver, persist a
// DriftReport, propose heal revisions for `healed` patches and a quarantine release for
// `at_risk`/`broken` ones, and serve the benchmark rows.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { AppError, USER_HEADER } from '@patchwork/shared';
import type { BenchRow, DriftReport, DriftService, FrozenPatch, ServiceRegistry } from '@patchwork/shared';
import { analyzeDrift } from '@patchwork/engine';
import { documentFromHtml } from '@patchwork/engine/node';
import type { Db } from '../db/sqlite.js';
import { createDriftRepo, type DriftRepo } from './repo.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const DEFAULT_BENCH_FILE = join(repoRoot, 'data', 'bench.json');

const newId = (prefix: string): string => `${prefix}_${nanoid(12)}`;

/** PatchBody.urlPath is an exact path or a trailing-* prefix glob such as '/products/*'. */
function pathMatches(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (pattern.endsWith('/*')) return path.startsWith(pattern.slice(0, -1));
  return false;
}

export interface DriftServiceOptions {
  benchFile?: string;
}

export function createDriftService(
  registry?: ServiceRegistry,
  db?: Db,
  opts: DriftServiceOptions = {},
): DriftService {
  const benchFile = opts.benchFile ?? DEFAULT_BENCH_FILE;
  let repo: DriftRepo | null = null;

  const requireDeps = (): { registry: ServiceRegistry; repo: DriftRepo } => {
    if (!registry || !db) {
      throw new AppError(
        'INVALID_STATE',
        'drift service needs (registry, db); buildRegistry must pass them (PLAN 11.13)',
      );
    }
    repo ??= createDriftRepo(db);
    return { registry, repo };
  };

  return {
    async check(projectId, actorId): Promise<DriftReport[]> {
      const { registry: reg, repo: r } = requireDeps();
      const project = reg.core.getProject(projectId);
      if (!project) throw new AppError('NOT_FOUND', `No project ${projectId}`);
      const live = reg.releases.live(projectId);
      if (!live) throw new AppError('INVALID_STATE', `Project ${projectId} has no live release to check`);

      const reports: DriftReport[] = [];
      for (const path of project.paths) {
        const patches = live.patches.filter((p) => pathMatches(p.urlPath, path));
        if (patches.length === 0) continue;

        const previous = reg.snapshots.latest(projectId, path);
        const fresh = await reg.snapshots.capture(projectId, path);
        if (previous && previous.domHash === fresh.domHash) continue; // upstream unchanged on this path

        const dom = documentFromHtml(fresh.html, `${project.upstreamOrigin}${path}`);
        const results = analyzeDrift(dom.document, patches, fresh.boxes);

        const report: DriftReport = {
          id: newId('drf'),
          projectId,
          releaseId: live.id,
          path,
          previousSnapshotId: previous?.id ?? null,
          snapshotId: fresh.id,
          createdAt: new Date().toISOString(),
          results,
          quarantineReleaseId: null,
        };
        r.insert(report);
        reg.audit.append({
          projectId,
          type: 'drift.detected',
          actorId,
          subject: { type: 'drift', id: report.id },
          data: {
            path,
            releaseId: live.id,
            snapshotId: fresh.id,
            previousSnapshotId: previous?.id ?? null,
            health: results.map((res) => ({ patchId: res.patchId, health: res.health })),
          },
        });

        for (const result of results) {
          if (result.health !== 'healed' || !result.proposedFingerprints) continue;
          reg.core.proposeHeal(
            result.patchId,
            result.proposedFingerprints,
            actorId,
            `Drift heal from ${report.id} (${path})`,
          );
          reg.audit.append({
            projectId,
            type: 'patch.heal_proposed',
            actorId,
            subject: { type: 'patch', id: result.patchId },
            data: { reportId: report.id, revision: result.revision, path },
          });
        }
        reports.push(report);
      }
      return reports;
    },

    list(projectId): DriftReport[] {
      return requireDeps().repo.list(projectId);
    },

    async proposeQuarantine(reportId, actorId) {
      const { registry: reg, repo: r } = requireDeps();
      const report = r.get(reportId);
      if (!report) throw new AppError('NOT_FOUND', `No drift report ${reportId}`);
      const release = reg.releases.get(report.releaseId);
      if (!release) throw new AppError('NOT_FOUND', `No release ${report.releaseId}`);

      const unsafe = new Set(
        report.results
          .filter((res) => res.health === 'at_risk' || res.health === 'broken')
          .map((res) => res.patchId),
      );
      if (unsafe.size === 0) {
        throw new AppError('INVALID_STATE', `Drift report ${reportId} has no at_risk or broken patches`);
      }

      // The live release minus the patches the resolver could not place safely.
      const kept: FrozenPatch[] = release.patches.filter((p) => !unsafe.has(p.patchId));
      const quarantine = reg.releases.create(
        report.projectId,
        {
          origin: 'quarantine',
          patches: kept,
          note: `Quarantine from drift ${report.id}: excludes ${[...unsafe].join(', ')}`,
        },
        actorId,
      );
      r.setQuarantineRelease(report.id, quarantine.id);
      reg.audit.append({
        projectId: report.projectId,
        type: 'release.quarantine_proposed',
        actorId,
        subject: { type: 'release', id: quarantine.id },
        data: { reportId: report.id, excluded: [...unsafe], kept: kept.map((p) => p.patchId) },
      });
      return quarantine;
    },

    bench(): BenchRow[] {
      let raw: string;
      try {
        raw = readFileSync(benchFile, 'utf8');
      } catch {
        return []; // bench has not run yet: nothing to show
      }
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) throw new Error('bench.json is not an array');
        return parsed as BenchRow[];
      } catch (err) {
        throw new AppError('INTERNAL', `bench file ${benchFile} is unreadable: ${(err as Error).message}`);
      }
    },
  };
}

function actorOf(req: { headers: Record<string, unknown> }): string {
  const header = req.headers[USER_HEADER];
  return typeof header === 'string' && header !== '' ? header : 'system';
}

export function registerDriftRoutes(app: FastifyInstance, registry: ServiceRegistry): void {
  // The scaffold registers temporary 501 stubs for these paths in app.ts; when Dev A
  // removes those entries the real handlers below take over. Guarding on hasRoute keeps
  // this module safe to land before that edit (no duplicate-route crash).
  if (!app.hasRoute({ method: 'POST', url: '/api/projects/:pid/drift/check' })) {
    app.post('/api/projects/:pid/drift/check', async (req) => {
      const { pid } = req.params as { pid: string };
      return { items: await registry.drift.check(pid, actorOf(req)) };
    });
  }
  if (!app.hasRoute({ method: 'GET', url: '/api/projects/:pid/drift' })) {
    app.get('/api/projects/:pid/drift', async (req) => {
      const { pid } = req.params as { pid: string };
      return { items: registry.drift.list(pid) };
    });
  }
  if (!app.hasRoute({ method: 'POST', url: '/api/drift/:id/quarantine' })) {
    app.post('/api/drift/:id/quarantine', async (req) => {
      const { id } = req.params as { id: string };
      return registry.drift.proposeQuarantine(id, actorOf(req));
    });
  }
  if (!app.hasRoute({ method: 'GET', url: '/api/bench' })) {
    app.get('/api/bench', async () => ({ items: registry.drift.bench() }));
  }
}
