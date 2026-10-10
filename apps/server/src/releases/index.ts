// apps/server/src/releases/index.ts (owner: Dev C)
// Releases (PLAN 11.8): freeze head, verify gate, deploy (one pointer move), health, rollback, beacons.
// Health (solo 3-hour version): after every pointer move a live verification run; if a deploy's run
// fails, the pointer returns to previousReleaseId (auto_rollback). Rollbacks get a health run too but
// never trigger another automatic rollback.
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import {
  AppError,
  DEFAULT_THRESHOLDS,
  deployRequestSchema,
  releaseRequestSchema,
  rollbackRequestSchema,
  USER_HEADER,
} from '@patchwork/shared';
import type {
  BeaconPayload,
  Deployment,
  DeploymentKind,
  FrozenPatch,
  Id,
  Release,
  ReleaseService,
  ReleaseStatus,
  RuntimeManifest,
  ServiceRegistry,
  VerificationRun,
} from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';
import { loadEnv, type Env } from '../env.js';

/** Deployment.releaseId of a rollback to "no release" (the column is NOT NULL). */
export const NO_RELEASE = 'none';

interface ReleaseRow {
  id: string;
  project_id: string;
  number: number;
  patches_json: string;
  manifest_hash: string;
  status: string;
  parent_release_id: string | null;
  origin: string;
  note: string;
  created_by: string;
  created_at: string;
  verification_run_id: string | null;
}

interface DeploymentRow {
  id: string;
  project_id: string;
  release_id: string;
  previous_release_id: string | null;
  kind: string;
  status: string;
  reason: string;
  actor_id: string;
  started_at: string;
  ended_at: string | null;
  health_run_id: string | null;
}

function rowToRelease(r: ReleaseRow): Release {
  return {
    id: r.id,
    projectId: r.project_id,
    number: r.number,
    patches: JSON.parse(r.patches_json) as FrozenPatch[],
    manifestHash: r.manifest_hash,
    status: r.status as ReleaseStatus,
    parentReleaseId: r.parent_release_id,
    origin: r.origin as Release['origin'],
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
    verificationRunId: r.verification_run_id,
  };
}

function rowToDeployment(r: DeploymentRow): Deployment {
  return {
    id: r.id,
    projectId: r.project_id,
    releaseId: r.release_id,
    previousReleaseId: r.previous_release_id,
    kind: r.kind as DeploymentKind,
    status: r.status as Deployment['status'],
    reason: r.reason,
    actorId: r.actor_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    healthRunId: r.health_run_id,
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/** sha256 of the canonical JSON (keys sorted recursively) of the frozen patch list. */
export const manifestHashOf = (patches: FrozenPatch[]): string =>
  createHash('sha256').update(JSON.stringify(sortKeys(patches))).digest('hex');

export interface ReleaseServiceExt extends ReleaseService {
  deployments(projectId: Id): Deployment[];
  /** Starts a release verification: status verifying -> verified | verification_failed. */
  verify(releaseId: Id, actorId: Id): VerificationRun;
}

/** VerifyService plus the completion hook verify/index.ts exposes (reached via the registry). */
type WaitableVerify = ServiceRegistry['verify'] & { wait?(id: Id): Promise<VerificationRun> };

export function createReleaseService(
  db: Db,
  registry: ServiceRegistry,
  _env: Env = loadEnv(),
): ReleaseServiceExt {
  const get = (id: Id): Release | null => {
    const row = db.prepare('SELECT * FROM releases WHERE id = ?').get(id) as unknown as
      | ReleaseRow
      | undefined;
    return row ? rowToRelease(row) : null;
  };

  const liveId = (projectId: Id): Id | null => {
    const row = db.prepare('SELECT live_release_id FROM projects WHERE id = ?').get(projectId) as
      | { live_release_id: string | null }
      | undefined;
    if (!row) throw new AppError('NOT_FOUND', `No project ${projectId}`);
    return row.live_release_id;
  };

  const live = (projectId: Id): Release | null => {
    const id = liveId(projectId);
    return id ? get(id) : null;
  };

  const getDeployment = (id: Id): Deployment => {
    const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id) as unknown as DeploymentRow;
    return rowToDeployment(row);
  };

  const setStatus = (releaseId: Id, status: ReleaseStatus): void => {
    db.prepare('UPDATE releases SET status = ? WHERE id = ?').run(status, releaseId);
  };

  const inTransaction = <T>(fn: () => T): T => {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  /**
   * The one pointer move (PLAN 11.8): projects.live_release_id := toReleaseId, the previous live
   * release becomes `previousStatus`, the target becomes `live`, and one deployments row is inserted.
   */
  const movePointer = (
    projectId: Id,
    toReleaseId: Id | null,
    kind: DeploymentKind,
    actorId: Id | 'system',
    reason: string,
    previousStatus: ReleaseStatus,
  ): Deployment =>
    inTransaction(() => {
      const previous = liveId(projectId);
      const now = new Date().toISOString();
      db.prepare('UPDATE projects SET live_release_id = ? WHERE id = ?').run(toReleaseId, projectId);
      if (previous && previous !== toReleaseId) setStatus(previous, previousStatus);
      if (toReleaseId) setStatus(toReleaseId, 'live');
      const id = `dep_${nanoid(12)}`;
      db.prepare(
        `INSERT INTO deployments
           (id, project_id, release_id, previous_release_id, kind, status, reason, actor_id, started_at, ended_at, health_run_id)
         VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, NULL, NULL)`,
      ).run(id, projectId, toReleaseId ?? NO_RELEASE, previous, kind, reason, actorId, now);
      return getDeployment(id);
    });

  const endDeployment = (id: Id, status: Deployment['status'], healthRunId: Id | null): void => {
    db.prepare('UPDATE deployments SET status = ?, ended_at = ?, health_run_id = COALESCE(?, health_run_id) WHERE id = ?').run(
      status,
      new Date().toISOString(),
      healthRunId,
      id,
    );
  };

  /**
   * Post-deploy health: one live verification run. A failed deploy moves the pointer back to
   * previousReleaseId (auto_rollback); a rollback's own health run never rolls back again.
   */
  const scheduleHealth = (deployment: Deployment, mayAutoRollback: boolean): void => {
    const projectId = deployment.projectId;
    void (async () => {
      const run = await registry.verify.runToCompletion(projectId, { kind: 'live' }, deployment.actorId);
      const current = getDeployment(deployment.id);
      if (current.status !== 'in_progress') return; // superseded by a later rollback meanwhile
      if (run.status === 'passed') {
        endDeployment(deployment.id, 'healthy', run.id);
        registry.audit.append({
          projectId,
          type: 'deployment.healthy',
          actorId: 'system',
          subject: { type: 'deployment', id: deployment.id },
          data: { releaseId: deployment.releaseId, healthRunId: run.id, summary: run.summary },
        });
        return;
      }
      endDeployment(deployment.id, 'failed', run.id);
      registry.audit.append({
        projectId,
        type: 'deployment.failed',
        actorId: 'system',
        subject: { type: 'deployment', id: deployment.id },
        data: { releaseId: deployment.releaseId, healthRunId: run.id, summary: run.summary },
      });
      if (!mayAutoRollback || liveId(projectId) !== deployment.releaseId) return;
      const back = movePointer(
        projectId,
        deployment.previousReleaseId,
        'auto_rollback',
        'system',
        `Health check failed for ${deployment.releaseId}: ${run.summary}`,
        'rolled_back',
      );
      registry.audit.append({
        projectId,
        type: 'release.auto_rolled_back',
        actorId: 'system',
        subject: { type: 'deployment', id: back.id },
        data: {
          fromReleaseId: deployment.releaseId,
          toReleaseId: deployment.previousReleaseId,
          failedDeploymentId: deployment.id,
          healthRunId: run.id,
        },
      });
      scheduleHealth(back, false);
    })().catch((err: unknown) => {
      endDeployment(deployment.id, 'failed', null);
      console.error('[releases] health check crashed:', err);
    });
  };

  return {
    create(projectId, input, actorId): Release {
      if (!registry.core.getProject(projectId)) throw new AppError('NOT_FOUND', `No project ${projectId}`);
      const patches = input.patches ?? registry.core.listHead(projectId);
      const max = db
        .prepare('SELECT COALESCE(MAX(number), 0) AS m FROM releases WHERE project_id = ?')
        .get(projectId) as { m: number };
      const release: Release = {
        id: `rel_${nanoid(12)}`,
        projectId,
        number: max.m + 1,
        patches,
        manifestHash: manifestHashOf(patches),
        status: 'candidate',
        parentReleaseId: liveId(projectId),
        origin: input.origin,
        note: input.note,
        createdBy: actorId,
        createdAt: new Date().toISOString(),
        verificationRunId: null,
      };
      db.prepare(
        `INSERT INTO releases
           (id, project_id, number, patches_json, manifest_hash, status, parent_release_id, origin, note, created_by, created_at, verification_run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(
        release.id,
        projectId,
        release.number,
        JSON.stringify(patches),
        release.manifestHash,
        release.status,
        release.parentReleaseId,
        release.origin,
        release.note,
        actorId,
        release.createdAt,
      );
      registry.audit.append({
        projectId,
        type: 'release.created',
        actorId,
        subject: { type: 'release', id: release.id },
        data: {
          number: release.number,
          origin: release.origin,
          manifestHash: release.manifestHash,
          patches: patches.map((p) => ({ patchId: p.patchId, revision: p.revision })),
          note: release.note,
        },
      });
      return release;
    },

    get,

    list(projectId): Release[] {
      const rows = db
        .prepare('SELECT * FROM releases WHERE project_id = ? ORDER BY number DESC')
        .all(projectId) as unknown as ReleaseRow[];
      return rows.map(rowToRelease);
    },

    live,

    manifestForLive(projectId): RuntimeManifest {
      const release = live(projectId);
      return {
        channel: 'live',
        projectId,
        releaseId: release?.id ?? null,
        previewId: null,
        resolverMode: 'smart',
        patches: release?.patches ?? [],
        editor: { enabled: false, allowedOrigin: null },
        beaconUrl: '/__patchwork/beacon',
        thresholds: { ...DEFAULT_THRESHOLDS },
      };
    },

    async deploy(releaseId, actorId, opts): Promise<Deployment> {
      const release = get(releaseId);
      if (!release) throw new AppError('NOT_FOUND', `No release ${releaseId}`);
      if (liveId(release.projectId) === release.id) {
        throw new AppError('INVALID_STATE', `R${release.number} is already live`);
      }
      const reason = opts.reason.trim();
      let kind: DeploymentKind;
      if (opts.force) {
        if (reason === '') throw new AppError('VALIDATION_FAILED', 'A force deploy needs a reason');
        kind = 'force_deploy';
      } else if (release.status === 'verified') {
        kind = 'deploy';
      } else {
        throw new AppError(
          'VERIFICATION_REQUIRED',
          `R${release.number} is ${release.status}; only verified releases deploy (or force with a reason)`,
        );
      }
      const deployment = movePointer(release.projectId, release.id, kind, actorId, reason, 'superseded');
      registry.audit.append({
        projectId: release.projectId,
        type: kind === 'force_deploy' ? 'release.force_deployed' : 'release.deployed',
        actorId,
        subject: { type: 'release', id: release.id },
        data: {
          deploymentId: deployment.id,
          number: release.number,
          previousReleaseId: deployment.previousReleaseId,
          releaseStatus: release.status,
          reason,
        },
      });
      scheduleHealth(deployment, true);
      return deployment;
    },

    async rollback(projectId, toReleaseId, actorId, reason): Promise<Deployment> {
      const current = live(projectId);
      if (!current) throw new AppError('INVALID_STATE', 'No live release to roll back');

      // Releases that were live at some point and whose deployment did not fail, newest first.
      const everLive = db
        .prepare(
          `SELECT release_id FROM deployments
            WHERE project_id = ? AND release_id != ? AND status != 'failed'
            ORDER BY started_at DESC, rowid DESC`,
        )
        .all(projectId, NO_RELEASE) as Array<{ release_id: string }>;

      let target: Release | null = null;
      if (toReleaseId) {
        target = get(toReleaseId);
        if (!target || target.projectId !== projectId) {
          throw new AppError('NOT_FOUND', `No release ${toReleaseId} in ${projectId}`);
        }
        if (target.id === current.id) throw new AppError('INVALID_STATE', `R${target.number} is already live`);
        if (!everLive.some((r) => r.release_id === target!.id)) {
          throw new AppError('INVALID_STATE', `R${target.number} was never live and healthy; deploy it instead`);
        }
      } else {
        const candidate = everLive.find((r) => r.release_id !== current.id);
        target = candidate ? get(candidate.release_id) : null;
      }

      const deployment = movePointer(projectId, target?.id ?? null, 'rollback', actorId, reason, 'rolled_back');
      db.prepare(
        `UPDATE deployments SET status = 'rolled_back', ended_at = COALESCE(ended_at, ?)
          WHERE project_id = ? AND release_id = ? AND id != ? AND status IN ('in_progress', 'healthy')`,
      ).run(new Date().toISOString(), projectId, current.id, deployment.id);
      registry.audit.append({
        projectId,
        type: 'release.rolled_back',
        actorId,
        subject: { type: 'deployment', id: deployment.id },
        data: {
          fromReleaseId: current.id,
          fromNumber: current.number,
          toReleaseId: target?.id ?? null,
          toNumber: target?.number ?? null,
          reason,
        },
      });
      scheduleHealth(deployment, false);
      return deployment;
    },

    verify(releaseId, actorId): VerificationRun {
      const release = get(releaseId);
      if (!release) throw new AppError('NOT_FOUND', `No release ${releaseId}`);
      if (!['candidate', 'verified', 'verification_failed'].includes(release.status)) {
        throw new AppError('INVALID_STATE', `R${release.number} is ${release.status}; it cannot be verified now`);
      }
      const verifier = registry.verify as WaitableVerify;
      const run = verifier.start(release.projectId, { kind: 'release', releaseId }, actorId);
      db.prepare("UPDATE releases SET status = 'verifying', verification_run_id = ? WHERE id = ?").run(run.id, releaseId);
      void (verifier.wait ? verifier.wait(run.id) : Promise.resolve(run)).then((done) => {
        // Only flip a release that is still waiting on this run (it may have been force-deployed).
        db.prepare(
          "UPDATE releases SET status = ? WHERE id = ? AND status = 'verifying' AND verification_run_id = ?",
        ).run(done.status === 'passed' ? 'verified' : 'verification_failed', releaseId, run.id);
      });
      return run;
    },

    recordBeacon(p: BeaconPayload): void {
      const insert = db.prepare(
        `INSERT INTO runtime_events
           (project_id, channel, release_id, preview_id, path, type, patch_id, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const now = new Date().toISOString();
      for (const e of p.events) {
        const patchId = e.type === 'js_error' ? null : e.patchId;
        insert.run(p.projectId, p.channel, p.releaseId, p.previewId, p.path, e.type, patchId, JSON.stringify(e), now);
      }
    },

    deployments(projectId): Deployment[] {
      const rows = db
        .prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY started_at DESC, rowid DESC')
        .all(projectId) as unknown as DeploymentRow[];
      return rows.map(rowToDeployment);
    },
  };
}

export function registerReleaseRoutes(app: FastifyInstance, registry: ServiceRegistry, db: Db): void {
  const releases = registry.releases as ReleaseServiceExt;

  /** The acting user; mutations require the release_manager role (PLAN 11.3). */
  const releaseManager = (req: FastifyRequest): Id => {
    const header = req.headers[USER_HEADER];
    const userId = typeof header === 'string' ? header : '';
    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
    if (!row) throw new AppError('FORBIDDEN', `Send ${USER_HEADER} with a known user id`);
    if (row.role !== 'release_manager') {
      throw new AppError('FORBIDDEN', `${userId} is a ${row.role}; only a release_manager can do this`);
    }
    return userId;
  };

  const requireProject = (pid: string): void => {
    if (!registry.core.getProject(pid)) throw new AppError('NOT_FOUND', `No project ${pid}`);
  };

  app.get('/api/projects/:pid/releases', async (req) => {
    const { pid } = req.params as { pid: string };
    requireProject(pid);
    return { items: releases.list(pid) };
  });

  app.post('/api/projects/:pid/releases', async (req) => {
    const { pid } = req.params as { pid: string };
    const actor = releaseManager(req);
    const { note } = releaseRequestSchema.parse(req.body ?? {});
    return releases.create(pid, { origin: 'head', note }, actor);
  });

  app.get('/api/releases/:id', async (req) => {
    const { id } = req.params as { id: string };
    const release = releases.get(id);
    if (!release) throw new AppError('NOT_FOUND', `No release ${id}`);
    return release;
  });

  app.post('/api/releases/:id/deploy', async (req) => {
    const { id } = req.params as { id: string };
    const actor = releaseManager(req);
    const body = deployRequestSchema.parse(req.body ?? {});
    return releases.deploy(id, actor, body);
  });

  app.post('/api/releases/:id/verify', async (req) => {
    const { id } = req.params as { id: string };
    return releases.verify(id, releaseManager(req));
  });

  app.post('/api/projects/:pid/rollback', async (req) => {
    const { pid } = req.params as { pid: string };
    const actor = releaseManager(req);
    const body = rollbackRequestSchema.parse(req.body ?? {});
    requireProject(pid);
    return releases.rollback(pid, body.toReleaseId ?? null, actor, body.reason);
  });

  app.get('/api/projects/:pid/deployments', async (req) => {
    const { pid } = req.params as { pid: string };
    requireProject(pid);
    return { items: releases.deployments(pid) };
  });
}
