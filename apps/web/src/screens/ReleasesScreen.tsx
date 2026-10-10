// apps/web/src/screens/ReleasesScreen.tsx (owner: Dev D)
// Releases (F5, F6): freeze head into a release, verify it in a real browser (checks, console
// errors, baseline / candidate / diff screenshots), deploy or force-deploy it, watch the health
// run decide, and roll back to any release that was live before.
import { useState } from 'react';
import type { Deployment, Project, Release, VerificationRun } from '@patchwork/shared';
import { api } from '../api.js';
import { LIVE_ORIGIN } from '../env.js';
import { usePoll } from '../usePoll.js';
import { EmptyState, ErrorNotice, Notice } from '../components/Notice.js';
import { Chip, DeploymentStatusChip, ReleaseStatusChip } from '../components/StatusChip.js';
import { firstProject, formatWhen, pct, useAction } from './shared.js';
import styles from './Screens.module.css';

interface ReleasesData {
  project: Project | null;
  releases: Release[];
  deployments: Deployment[];
}

const KIND_LABEL: Record<Deployment['kind'], string> = {
  deploy: 'Deployed',
  force_deploy: 'Force-deployed',
  rollback: 'Rolled back',
  auto_rollback: 'Automatic rollback',
};

const RUN_TONE: Record<VerificationRun['status'], { tone: 'info' | 'healthy' | 'broken'; glyph: string }> = {
  queued: { tone: 'info', glyph: '◔' },
  running: { tone: 'info', glyph: '◔' },
  passed: { tone: 'healthy', glyph: '✓' },
  failed: { tone: 'broken', glyph: '✕' },
  error: { tone: 'broken', glyph: '✕' },
};

function stepText(step: VerificationRun['steps'][number]['step']): string {
  switch (step.action) {
    case 'goto':
      return `Open ${step.path}`;
    case 'click':
      return `Click ${step.target}`;
    case 'fill':
      return `Fill ${step.target} with “${step.value}”`;
    case 'expectText':
      return `Expect ${step.target} to contain “${step.contains}”`;
    case 'expectVisible':
      return `Expect ${step.target} visible`;
    case 'expectHidden':
      return `Expect ${step.target} hidden`;
    case 'expectUrl':
      return `Expect URL to contain ${step.contains}`;
  }
}

function RunEvidence({ runId, titleOf }: { runId: string; titleOf: (id: string | null) => string }) {
  const { data: run, error } = usePoll(() => api.verification(runId), 1500);
  if (error) return <ErrorNotice error={error} />;
  if (!run) return <p className={styles.small}>Loading verification…</p>;
  const tone = RUN_TONE[run.status];
  return (
    <div>
      <div className={styles.panelHead}>
        <h3>Verification</h3>
        <Chip tone={tone.tone} glyph={tone.glyph}>{run.status}</Chip>
      </div>
      <p className={styles.small}>{run.summary}</p>

      {run.patchApplication.length > 0 ? (
        <>
          <h4 className={styles.subhead}>Patches in the page</h4>
          <div className={styles.scroll}>
          <table className="table">
            <tbody>
              {run.patchApplication.map((s) => (
                <tr key={s.patchId}>
                  <td>{titleOf(s.patchId)}</td>
                  <td>
                    <Chip tone={s.applied ? 'healthy' : s.reason === 'path_mismatch' ? 'neutral' : 'broken'} glyph={s.applied ? '✓' : '✕'}>
                      {s.applied ? 'applied' : s.reason.replace(/_/g, ' ')}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      ) : null}

      {run.steps.length > 0 ? (
        <>
          <h4 className={styles.subhead}>Checks</h4>
          <div className={styles.scroll}>
          <table className="table">
            <tbody>
              {run.steps.map((s, i) => (
                <tr key={i}>
                  <td>{titleOf(s.patchId)}</td>
                  <td>{stepText(s.step)}</td>
                  <td>
                    <Chip tone={s.ok ? 'healthy' : 'broken'} glyph={s.ok ? '✓' : '✕'}>{s.ok ? 'ok' : 'failed'}</Chip>
                    {s.error ? <div className={styles.reason}>{s.error}</div> : null}
                    {s.screenshot ? (
                      <a href={api.artifactUrl(s.screenshot)} target="_blank" rel="noreferrer" className={styles.small}>
                        Screenshot of the failure
                      </a>
                    ) : null}
                  </td>
                  <td className="num">{s.durationMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      ) : null}

      <h4 className={styles.subhead}>New console errors</h4>
      {run.newConsoleErrors.length === 0 ? (
        <p className={styles.small}>None compared with the baseline.</p>
      ) : (
        <ul className={styles.small}>
          {run.newConsoleErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {run.visual.map((v) => (
        <div key={v.path}>
          <h4 className={styles.subhead}>
            Screenshots of {v.path}: <span className="num">{pct(v.outsideMaskRatio)}</span> of pixels differ
            {v.outcome === 'warn' ? ' (reported, does not block)' : ''}
          </h4>
          <div className={styles.shots}>
            {(
              [
                ['Live today', v.baseline],
                ['With this release', v.candidate],
                ['Difference in red', v.diff],
              ] as const
            ).map(([label, file]) => (
              <figure key={file} className={styles.shot}>
                <a href={api.artifactUrl(file)} target="_blank" rel="noreferrer">
                  <img src={api.artifactUrl(file)} alt={`${label}, ${v.path}`} loading="lazy" width={1280} height={800} />
                </a>
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReleasesScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [forceReason, setForceReason] = useState('');
  const [rollbackTo, setRollbackTo] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');

  const { data, error, loading, reload } = usePoll<ReleasesData>(async () => {
    const project = await firstProject();
    if (!project) return { project: null, releases: [], deployments: [] };
    const [releases, deployments] = await Promise.all([api.releases(project.id), api.deployments(project.id)]);
    return { project, releases: releases.items, deployments: deployments.items };
  });
  const action = useAction(reload);

  if (loading && !data) return <p className={styles.small}>Loading releases…</p>;
  if (error) return <ErrorNotice error={error} />;
  if (!data?.project) return <EmptyState>No project yet. Run <code>npm run reset</code> to seed ShopLite.</EmptyState>;

  const { project, releases, deployments } = data;
  const live = releases.find((r) => r.id === project.liveReleaseId) ?? null;
  const selected = releases.find((r) => r.id === selectedId) ?? releases[0] ?? null;
  const numberOf = (id: string | null) => {
    if (!id || id === 'none') return 'no release';
    const r = releases.find((x) => x.id === id);
    return r ? `R${r.number}` : id;
  };
  const titleOf = (patchId: string | null) =>
    releases.flatMap((r) => r.patches).find((p) => p.patchId === patchId)?.title ?? patchId ?? 'Page';
  const everLive = [
    ...new Set(
      deployments
        .filter((d) => d.status !== 'failed' && d.releaseId !== 'none' && d.releaseId !== live?.id)
        .map((d) => d.releaseId),
    ),
  ];

  return (
    <section>
      <div className={styles.head}>
        <h1>Releases</h1>
        <span className={styles.small}>
          Live now: <strong>{live ? `R${live.number}` : 'no release'}</strong> on{' '}
          <a href={`${LIVE_ORIGIN}/cart`} target="_blank" rel="noreferrer">{LIVE_ORIGIN}</a>
        </span>
      </div>
      <p className={styles.lede}>
        A release freezes everything merged. It deploys only after verification passes, unless a release
        manager forces it with a reason. Every deploy gets a health run on the live site; if it fails, the
        previous release comes back automatically.
      </p>

      <div className={styles.actions}>
        <input
          className={styles.field}
          name="release-note"
          autoComplete="off"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Release note, e.g. checkout fix and price typo…"
          aria-label="Release note"
        />
        <button
          className="btn btn--primary"
          type="button"
          disabled={action.busy !== null}
          onClick={() =>
            void action.run('create', async () => {
              const r = await api.createRelease(project.id, note);
              setNote('');
              setSelectedId(r.id);
            })
          }
        >
          Create release from merged patches
        </button>
      </div>
      {action.error ? <ErrorNotice error={action.error} /> : null}

      {releases.length === 0 ? (
        <EmptyState>No releases yet. Merge a patch, then create the first release.</EmptyState>
      ) : (
        <div className={styles.scroll}>
        <table className="table table--rows">
          <thead>
            <tr>
              <th>Release</th>
              <th>Status</th>
              <th className="num">Patches</th>
              <th>Note</th>
              <th>Created</th>
              <th>
                <span className={styles.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {releases.map((r) => (
              <tr key={r.id}>
                <td>
                  <button className="btn" type="button" onClick={() => setSelectedId(r.id)} aria-pressed={selected?.id === r.id}>
                    R{r.number}
                  </button>
                </td>
                <td><ReleaseStatusChip status={r.status} /></td>
                <td className="num">{r.patches.length}</td>
                <td>{r.note || <span className={styles.small}>{r.origin}</span>}</td>
                <td className={styles.small}>{formatWhen(r.createdAt)}</td>
                <td>
                  <span className={styles.actions} style={{ margin: 0 }}>
                    {['candidate', 'verification_failed', 'verified'].includes(r.status) ? (
                      <button
                        className="btn"
                        type="button"
                        disabled={action.busy !== null}
                        onClick={() =>
                          void action.run('verify', async () => {
                            await api.verifyRelease(r.id);
                            setSelectedId(r.id);
                          })
                        }
                      >
                        Verify
                      </button>
                    ) : null}
                    {r.status === 'verified' ? (
                      <button
                        className="btn btn--primary"
                        type="button"
                        disabled={action.busy !== null}
                        onClick={() => void action.run('deploy', () => api.deployRelease(r.id, { force: false, reason: '' }))}
                      >
                        Deploy
                      </button>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {selected ? (
        <div className={`${styles.panel} ${styles.block}`}>
          <div className={styles.panelHead}>
            <h2>R{selected.number}</h2>
            <ReleaseStatusChip status={selected.status} />
          </div>
          <div className={styles.meta}>
            {selected.patches.length} patch{selected.patches.length === 1 ? '' : 'es'}:{' '}
            {selected.patches.map((p) => p.title).join(', ') || 'none'}. Manifest{' '}
            <span className="mono-id">{selected.manifestHash.slice(0, 12)}</span>
          </div>

          {selected.verificationRunId ? (
            <RunEvidence key={selected.verificationRunId} runId={selected.verificationRunId} titleOf={titleOf} />
          ) : (
            <p className={styles.small}>Not verified yet. Verify runs every patch's checks in a real browser.</p>
          )}

          {selected.status !== 'live' ? (
            <>
              <h3 className={styles.subhead}>Force deploy</h3>
              <p className={styles.small}>
                Skips the verification gate. The health run still checks the live site and rolls back if it fails.
              </p>
              <div className={styles.actions}>
                <input
                  className={styles.field}
                  name="force-reason"
                  autoComplete="off"
                  value={forceReason}
                  onChange={(e) => setForceReason(e.target.value)}
                  placeholder="Why it cannot wait, e.g. sale starts at noon…"
                  aria-label="Force deploy reason"
                />
                <button
                  className="btn btn--danger"
                  type="button"
                  disabled={action.busy !== null || forceReason.trim() === ''}
                  onClick={() =>
                    window.confirm(`Force-deploy R${selected.number} without passing verification? The health run can still roll it back.`) &&
                    void action.run('force', async () => {
                      await api.deployRelease(selected.id, { force: true, reason: forceReason });
                      setForceReason('');
                    })
                  }
                >
                  Force deploy R{selected.number}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className={styles.block}>
        <h2>Deployments</h2>
        {deployments.length === 0 ? (
          <EmptyState>Nothing deployed yet.</EmptyState>
        ) : (
          <ol className={styles.timeline} aria-label="Deployments, newest first">
            {deployments.map((d) => (
              <li key={d.id} className={`${styles.event} ${d.kind === 'auto_rollback' ? styles.eventAuto : ''}`}>
                <div className={styles.eventLine}>
                  <strong>
                    {KIND_LABEL[d.kind]} {d.kind.includes('rollback') ? 'to' : ''} {numberOf(d.releaseId)}
                  </strong>
                  <DeploymentStatusChip status={d.status} />
                  <span className={styles.small}>
                    from {numberOf(d.previousReleaseId)}, by {d.actorId}, {formatWhen(d.startedAt)}
                  </span>
                </div>
                {d.reason ? <div className={styles.reason}>{d.reason}</div> : null}
              </li>
            ))}
          </ol>
        )}

        {live ? (
          <>
            <h3 className={styles.subhead}>Roll back</h3>
            <div className={styles.actions}>
              <select
                className={styles.field}
                value={rollbackTo}
                onChange={(e) => setRollbackTo(e.target.value)}
                aria-label="Roll back to"
              >
                <option value="">The last release that was live and healthy</option>
                {everLive.map((id) => (
                  <option key={id} value={id}>
                    {numberOf(id)}
                  </option>
                ))}
              </select>
              <input
                className={styles.field}
                name="rollback-reason"
                autoComplete="off"
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="Reason, e.g. checkout broke after deploy…"
                aria-label="Rollback reason"
              />
              <button
                className="btn btn--danger"
                type="button"
                disabled={action.busy !== null || rollbackReason.trim() === ''}
                onClick={() =>
                  window.confirm(`Take R${live.number} off the live site now?`) &&
                  void action.run('rollback', async () => {
                    await api.rollback(project.id, {
                      ...(rollbackTo ? { toReleaseId: rollbackTo } : {}),
                      reason: rollbackReason,
                    });
                    setRollbackReason('');
                    setRollbackTo('');
                  })
                }
              >
                Roll back R{live.number}
              </button>
            </div>
          </>
        ) : (
          <Notice>No release is live, so there is nothing to roll back.</Notice>
        )}
      </div>
    </section>
  );
}
