// apps/web/src/screens/ShipScreen.tsx (owner: Dev D)
// Ship: releases as a pipeline (merged fixes -> release -> browser test -> deploy -> live health),
// the browser test's evidence, every version with a one-click rollback, and a timeline in sentences.
import { useState } from 'react';
import type { Deployment, Patch, Project, Release, User, VerificationRun } from '@patchwork/shared';
import { api } from '../api.js';
import { LIVE_ORIGIN } from '../env.js';
import { usePoll } from '../usePoll.js';
import { EmptyState, ErrorNotice, Notice } from '../components/Notice.js';
import { Chip, ReleaseStatusChip } from '../components/StatusChip.js';
import { actAs, nameOf, personFor } from '../team.js';
import { firstProject, formatWhen, pct } from './shared.js';
import { stepText } from '../studio/fixes.js';
import styles from './Ship.module.css';

interface ShipData {
  project: Project | null;
  releases: Release[];
  deployments: Deployment[];
  patches: Patch[];
  users: User[];
}

type NodeState = 'done' | 'running' | 'failed' | 'todo';
const GLYPH: Record<NodeState, string> = { done: '✓', running: '◔', failed: '✕', todo: '○' };
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function timeOf(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ShipScreen() {
  const [reason, setReason] = useState('');
  const [showForce, setShowForce] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const { data, error: loadError, loading, reload } = usePoll<ShipData>(async () => {
    const [project, users] = await Promise.all([firstProject(), api.users()]);
    if (!project) return { project: null, releases: [], deployments: [], patches: [], users: users.items };
    const [releases, deployments, patches] = await Promise.all([
      api.releases(project.id),
      api.deployments(project.id),
      api.patches(project.id),
    ]);
    return { project, releases: releases.items, deployments: deployments.items, patches: patches.items, users: users.items };
  }, 1500);

  const newest = data?.releases[0] ?? null;
  const { data: run } = usePoll<VerificationRun | null>(
    async () => (newest?.verificationRunId ? api.verification(newest.verificationRunId) : null),
    1500,
  );

  if (loading && !data) return <p className={styles.small}>Loading releases…</p>;
  if (loadError) return <ErrorNotice error={loadError} />;
  if (!data?.project) return <EmptyState>No project yet. Run <code>./demo.sh</code> to seed ShopLite.</EmptyState>;

  const { project, releases, deployments, patches, users } = data;
  const rm = personFor(users, 'release_manager');
  const rmName = rm?.name ?? 'the release manager';
  const live = releases.find((r) => r.id === project.liveReleaseId) ?? null;
  const label = (id: string | null) => {
    if (!id || id === 'none') return 'the original site';
    const r = releases.find((x) => x.id === id);
    return r ? `R${r.number}` : 'an earlier release';
  };
  const titleOf = (patchId: string | null) =>
    patches.find((p) => p.id === patchId)?.title ?? releases.flatMap((r) => r.patches).find((p) => p.patchId === patchId)?.title ?? 'A fix';

  // fixes merged but not in the newest release yet
  const inNewest = new Set(newest?.patches.map((p) => `${p.patchId}:${p.revision}`) ?? []);
  const waitingToShip = patches.filter(
    (p) => p.mergedRevision !== null && !inNewest.has(`${p.id}:${p.mergedRevision}`),
  );

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      if (rm) await actAs(rm.id, fn);
      else await fn();
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  /* --- pipeline nodes for the newest release --- */
  const newestDeploy = newest ? deployments.find((d) => d.releaseId === newest.id && d.kind !== 'rollback') : undefined;
  const autoBack = newestDeploy
    ? deployments.find((d) => d.kind === 'auto_rollback' && d.previousReleaseId === newest?.id)
    : undefined;
  const testState: NodeState = !newest?.verificationRunId
    ? 'todo'
    : !run || run.status === 'queued' || run.status === 'running'
      ? 'running'
      : run.status === 'passed'
        ? 'done'
        : 'failed';
  const healthState: NodeState = !newestDeploy
    ? 'todo'
    : newestDeploy.status === 'in_progress'
      ? 'running'
      : newestDeploy.status === 'healthy'
        ? 'done'
        : 'failed';

  const nodes: Array<{ key: string; title: string; state: NodeState; detail: string }> = [
    {
      key: 'merged',
      title: 'Merged fixes',
      state: waitingToShip.length > 0 || newest ? 'done' : 'todo',
      detail: waitingToShip.length > 0 ? `${waitingToShip.length} waiting to ship` : newest ? `${newest.patches.length} in R${newest.number}` : 'none yet',
    },
    {
      key: 'release',
      title: newest ? `Release R${newest.number}` : 'Release',
      state: newest ? 'done' : 'todo',
      detail: newest ? `created ${timeOf(newest.createdAt)}` : 'not created',
    },
    {
      key: 'test',
      title: 'Browser test',
      state: testState,
      detail:
        testState === 'todo' ? 'not run' : testState === 'running' ? 'running in Chromium…' : testState === 'done' ? `passed ${timeOf(run?.finishedAt)}` : 'found a problem',
    },
    {
      key: 'deploy',
      title: 'Deploy',
      state: newestDeploy ? 'done' : 'todo',
      detail: newestDeploy
        ? `${newestDeploy.kind === 'force_deploy' ? 'forced' : 'deployed'} by ${nameOf(users, newestDeploy.actorId)} ${timeOf(newestDeploy.startedAt)}`
        : 'not deployed',
    },
    {
      key: 'health',
      title: 'Live health',
      state: autoBack ? 'failed' : healthState,
      detail: autoBack
        ? `failed, rolled back to ${label(autoBack.releaseId)}`
        : healthState === 'todo'
          ? 'after deploy'
          : healthState === 'running'
            ? 'checking the live site…'
            : healthState === 'done'
              ? 'healthy'
              : 'failed',
    },
  ];

  const canTest = newest && ['candidate', 'verified', 'verification_failed'].includes(newest.status);
  const canDeploy = newest && newest.status === 'verified';
  const everHealthy = new Set(deployments.filter((d) => d.status === 'healthy' || d.status === 'rolled_back').map((d) => d.releaseId));

  return (
    <section className={styles.ship}>
      <div className={styles.head}>
        <h1>Ship</h1>
        <p className={styles.liveNow}>
          <span className={styles.liveDot} aria-hidden="true" /> Live now: <strong>{live ? `R${live.number}` : 'the original site'}</strong>{' '}
          <a href={`${LIVE_ORIGIN}/cart`} target="_blank" rel="noreferrer">
            open the live site
          </a>
        </p>
      </div>

      {/* ---- pipeline ---- */}
      <ol className={styles.pipeline} aria-label="Release pipeline">
        {nodes.map((n) => (
          <li key={n.key} className={`${styles.node} ${styles[n.state]}`}>
            <span className={styles.nodeGlyph} aria-hidden="true">
              {GLYPH[n.state]}
            </span>
            <span className={styles.nodeTitle}>{n.title}</span>
            <span className={styles.nodeDetail}>{n.detail}</span>
          </li>
        ))}
      </ol>

      <div className={styles.actions}>
        <button
          className="btn btn--primary"
          type="button"
          disabled={busy !== null || waitingToShip.length === 0}
          title={waitingToShip.length === 0 ? 'Merge a fix in Review first' : undefined}
          onClick={() => void act('create', () => api.createRelease(project.id, waitingToShip.map((p) => p.title).join(', ')))}
        >
          {waitingToShip.length === 0
            ? 'Create release (merge a fix first)'
            : `Create release from ${waitingToShip.length} merged fix${waitingToShip.length === 1 ? '' : 'es'} as ${rmName}`}
        </button>
        <button
          className="btn"
          type="button"
          disabled={busy !== null || !canTest}
          onClick={() => newest && void act('test', () => api.verifyRelease(newest.id))}
        >
          Run browser test
        </button>
        <button
          className="btn btn--primary"
          type="button"
          disabled={busy !== null || !canDeploy}
          title={!canDeploy ? 'Deploys only after the browser test passes' : undefined}
          onClick={() => newest && void act('deploy', () => api.deployRelease(newest.id, { force: false, reason: '' }))}
        >
          Deploy {newest ? `R${newest.number}` : ''} as {rmName}
        </button>
        {newest && newest.status !== 'live' ? (
          <button className="btn btn--danger" type="button" onClick={() => setShowForce((s) => !s)} aria-expanded={showForce}>
            Force deploy…
          </button>
        ) : null}
      </div>
      {showForce && newest && newest.status !== 'live' ? (
        <div className={styles.force}>
          <p className={styles.small}>
            Skips the browser test. The live health check still runs, and a failing release rolls itself back.
          </p>
          <div className={styles.actions}>
            <input
              className={styles.field}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why it can't wait, e.g. the sale starts at noon…"
              aria-label="Reason for force deploy"
              name="force-reason"
              autoComplete="off"
            />
            <button
              className="btn btn--danger"
              type="button"
              disabled={busy !== null || reason.trim() === ''}
              onClick={() =>
                void act('force', async () => {
                  await api.deployRelease(newest.id, { force: true, reason });
                  setReason('');
                  setShowForce(false);
                })
              }
            >
              Force deploy R{newest.number} as {rmName}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <ErrorNotice error={error} /> : null}

      {/* ---- browser test evidence ---- */}
      {newest && run ? <TestEvidence run={run} titleOf={titleOf} releaseNumber={newest.number} /> : null}

      {/* ---- versions ---- */}
      <div className={styles.block}>
        <h2>Versions</h2>
        {releases.length === 0 ? (
          <EmptyState>No releases yet. Merge a fix in Review, then create the first release here.</EmptyState>
        ) : (
          <div className={styles.scroll}>
            <table className="table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Fixes</th>
                  <th>Created</th>
                  <th>
                    <span className={styles.srOnly}>Roll back</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {releases.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>R{r.number}</strong>
                      {r.origin === 'quarantine' ? <span className={styles.small}> safe release from Drift Sentinel</span> : null}
                    </td>
                    <td>
                      <ReleaseStatusChip status={r.status} />
                    </td>
                    <td className={styles.fixes}>{r.patches.map((p) => p.title).join(', ') || 'no fixes (the original site)'}</td>
                    <td className={styles.small}>{formatWhen(r.createdAt)}</td>
                    <td>
                      {live && r.id !== live.id && everHealthy.has(r.id) ? (
                        <button
                          className="btn btn--danger"
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            window.confirm(`Put R${r.number} back on the live site now?`) &&
                            void act('rollback', () =>
                              api.rollback(project.id, { toReleaseId: r.id, reason: `${rmName} rolled back to R${r.number}` }),
                            )
                          }
                        >
                          Roll back to this version
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- timeline ---- */}
      <div className={styles.block}>
        <h2>What happened</h2>
        {deployments.length === 0 ? (
          <EmptyState>Nothing deployed yet.</EmptyState>
        ) : (
          <ol className={styles.timeline}>
            {deployments.map((d) => {
              const who = nameOf(users, d.actorId);
              const health =
                d.status === 'healthy' ? 'health check passed' : d.status === 'failed' ? 'health check failed' : d.status === 'rolled_back' ? 'later rolled back' : 'checking health…';
              const sentence =
                d.kind === 'auto_rollback'
                  ? `PATCHWORK automatically rolled back to ${label(d.releaseId)}`
                  : d.kind === 'rollback'
                    ? `${who} rolled back to ${label(d.releaseId)}`
                    : `${who} ${d.kind === 'force_deploy' ? 'force-deployed' : 'deployed'} ${label(d.releaseId)}`;
              return (
                <li key={d.id} className={`${styles.event} ${d.kind === 'auto_rollback' ? styles.eventAuto : ''}`}>
                  <span className={`${styles.eventTime} num`}>{timeOf(d.startedAt)}</span>
                  <span>
                    {sentence}, {health}.{d.reason ? <span className={styles.small}> “{d.reason}”</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function TestEvidence({
  run,
  titleOf,
  releaseNumber,
}: {
  run: VerificationRun;
  titleOf: (id: string | null) => string;
  releaseNumber: number;
}) {
  const [split, setSplit] = useState(50);
  const [showDiff, setShowDiff] = useState(false);
  const done = run.status !== 'queued' && run.status !== 'running';
  if (!done) return <Notice title="Browser test running">A real Chromium is loading the site with R{releaseNumber}…</Notice>;
  const failedSteps = run.steps.filter((s) => !s.ok);
  return (
    <div className={styles.block}>
      <h2>Browser test of R{releaseNumber}</h2>
      <p className={styles.small}>
        {run.status === 'passed' ? '✓ Passed' : '✕ Found a problem'}: {run.steps.length - failedSteps.length} of {run.steps.length} checks passed,{' '}
        {run.newConsoleErrors.length === 0 ? 'no new errors in the page' : `${run.newConsoleErrors.length} new error(s) in the page`}.
      </p>
      {run.steps.length > 0 ? (
        <ul className={styles.checks}>
          {run.steps.map((s, i) => (
            <li key={i} className={s.ok ? undefined : styles.checkFailed}>
              <span aria-hidden="true">{s.ok ? '✓' : '✕'}</span>
              <span>
                <strong>{titleOf(s.patchId)}</strong>: {cap(stepText(s.step).replace('the picked element', 'its element'))}
                {s.error ? <span className={styles.small}> {s.error}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {run.newConsoleErrors.length > 0 ? (
        <Notice tone="error" title="New errors in the page">
          {run.newConsoleErrors.join('; ')}
        </Notice>
      ) : null}

      {run.visual.map((v) => (
        <div key={v.path} className={styles.visual}>
          <div className={styles.visualHead}>
            <h3>Page {v.path}</h3>
            <span className={styles.small}>
              {v.layoutChanging
                ? 'Expected: this release adds, hides or moves something, so the page reflows.'
                : `Change outside the fixed elements: ${pct(v.outsideMaskRatio)}`}
            </span>
            <label className={styles.toggle}>
              <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} /> Show differences
            </label>
          </div>
          {showDiff ? (
            <figure className={styles.compare}>
              <img src={api.artifactUrl(v.diff)} alt={`Differences on ${v.path}: red is outside the fix, violet is the fix`} width={1280} height={800} />
              <figcaption className={styles.small}>Violet: the fixed elements. Red: anything else that changed.</figcaption>
            </figure>
          ) : (
            <figure className={styles.compare}>
              <div className={styles.slider}>
                <img src={api.artifactUrl(v.baseline)} alt={`Live today, ${v.path}`} width={1280} height={800} />
                <img
                  className={styles.after}
                  src={api.artifactUrl(v.candidate)}
                  alt={`With R${releaseNumber}, ${v.path}`}
                  width={1280}
                  height={800}
                  style={{ clipPath: `inset(0 0 0 ${split}%)` }}
                />
                <span className={styles.splitLine} style={{ left: `${split}%` }} aria-hidden="true" />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={split}
                onChange={(e) => setSplit(Number(e.target.value))}
                aria-label="Slide between live today and with this release"
                className={styles.range}
              />
              <figcaption className={styles.small}>
                Left of the line: live today. Right: with R{releaseNumber}.
              </figcaption>
            </figure>
          )}
        </div>
      ))}
      {run.visual.length > 0 ? null : <Chip tone="neutral">no screenshots for this run</Chip>}
    </div>
  );
}
