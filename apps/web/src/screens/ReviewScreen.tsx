// apps/web/src/screens/ReviewScreen.tsx (owner: Dev D)
// Review & merge (F3): patches waiting for review or merge, their operations, conflict check,
// approve / request changes, and merge with an explicit choice when a conflict blocks it.
import { useState } from 'react';
import type { Conflict, ConflictReport, ConflictResolutionChoice, Patch, User } from '@patchwork/shared';
import { api, isApiClientError } from '../api.js';
import { usePoll } from '../usePoll.js';
import { EmptyState, ErrorNotice, Notice } from '../components/Notice.js';
import { Chip, PatchStatusChip } from '../components/StatusChip.js';
import { useCurrentUserId } from '../user.js';
import { describePatchOp, firstProject, formatWhen, useAction } from './shared.js';
import styles from './Screens.module.css';

interface ReviewData {
  projectId: string | null;
  patches: Patch[];
  all: Patch[];
  users: User[];
}

function ConflictCard({
  conflict,
  titleOf,
  onOverride,
  busy,
}: {
  conflict: Conflict;
  titleOf: (id: string) => string;
  onOverride?: () => void;
  busy: boolean;
}) {
  const blocking = conflict.severity === 'blocking';
  const [candidate, existing] = conflict.patchIds;
  return (
    <div className={`${styles.conflict} ${blocking ? styles.conflictBlocking : ''}`}>
      <div className={styles.conflictHead}>
        <strong>{conflict.type.replace(/_/g, ' ').toLowerCase()}</strong>
        <Chip tone={blocking ? 'broken' : 'atrisk'} glyph={blocking ? '✕' : '!'}>
          {blocking ? 'blocks merge' : 'warning'}
        </Chip>
      </div>
      <div>{conflict.message}</div>
      <dl className={styles.values}>
        <dt>This patch</dt>
        <dd>{titleOf(candidate)}</dd>
        {existing ? (
          <>
            <dt>Already merged</dt>
            <dd>{titleOf(existing)}</dd>
          </>
        ) : null}
        {conflict.property ? (
          <>
            <dt>Property</dt>
            <dd>{conflict.property}</dd>
          </>
        ) : null}
        {conflict.values ? (
          <>
            <dt>Values</dt>
            <dd>
              merged “{conflict.values.existing ?? '—'}”, this patch “{conflict.values.candidate ?? '—'}”
            </dd>
          </>
        ) : null}
        {conflict.elementPath ? (
          <>
            <dt>Element</dt>
            <dd className="mono-id">{conflict.elementPath}</dd>
          </>
        ) : null}
      </dl>
      {onOverride ? (
        <button className="btn btn--primary" type="button" disabled={busy} onClick={onOverride}>
          Merge with this patch overriding
        </button>
      ) : null}
    </div>
  );
}

export function ReviewScreen() {
  const userId = useCurrentUserId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [report, setReport] = useState<ConflictReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, reload } = usePoll<ReviewData>(async () => {
    const [project, users] = await Promise.all([firstProject(), api.users()]);
    if (!project) return { projectId: null, patches: [], all: [], users: users.items };
    const all = (await api.patches(project.id)).items;
    const waiting = all.filter((p) => p.status === 'in_review' || p.status === 'approved');
    return { projectId: project.id, patches: waiting, all, users: users.items };
  });
  const action = useAction(reload);

  if (loading && !data) return <p className={styles.small}>Loading patches for review…</p>;
  if (error) return <ErrorNotice error={error} />;
  if (!data?.projectId) return <EmptyState>No project yet. Run <code>npm run reset</code> to seed ShopLite.</EmptyState>;

  const { patches, all, users, projectId } = data;
  const selected = patches.find((p) => p.id === selectedId) ?? patches[0] ?? null;
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const titleOf = (id: string) => all.find((p) => p.id === id)?.title ?? id;
  const isAuthor = selected !== null && selected.authorId === userId;

  const select = (id: string) => {
    setSelectedId(id);
    setReport(null);
    setNotice(null);
    action.setError(null);
  };

  const merge = async (patch: Patch, choices: ConflictResolutionChoice[]) => {
    setNotice(null);
    try {
      await api.mergePatch(patch.id, { choices });
      setReport(null);
      setNotice(`Merged “${patch.title}”. It is now in head and goes out with the next release.`);
      action.setError(null);
      reload();
    } catch (err) {
      if (isApiClientError(err) && err.code === 'MERGE_BLOCKED' && err.details) {
        setReport(err.details as ConflictReport);
        action.setError(null);
      } else {
        action.setError(err);
      }
    }
  };

  const overrideAll = (patch: Patch, r: ConflictReport) =>
    merge(
      patch,
      r.conflicts
        .filter((c) => c.severity === 'blocking')
        .map((c) => ({ conflictId: c.id, choice: 'candidate_overrides' as const, note: 'Reviewer chose: this patch overrides' })),
    );

  return (
    <section>
      <div className={styles.head}>
        <h1>Review &amp; merge</h1>
      </div>
      <p className={styles.lede}>
        Patches waiting for a decision. Conflicts are checked on the element itself, against everything
        already merged. Authors cannot approve or merge their own patch.
      </p>

      {notice ? (
        <div className={styles.stack} style={{ marginBottom: '1rem' }} aria-live="polite">
          <Notice title="Merged">{notice}</Notice>
        </div>
      ) : null}

      {patches.length === 0 ? (
        <EmptyState>Nothing to review. Submitted patches appear here.</EmptyState>
      ) : (
        <div className={styles.split}>
          <ul className={styles.list} aria-label="Patches to review">
            {patches.map((p) => (
              <li key={p.id} className={styles.listItem}>
                <button
                  type="button"
                  className={styles.listButton}
                  aria-current={selected?.id === p.id ? 'true' : undefined}
                  onClick={() => select(p.id)}
                >
                  <strong>{p.title}</strong>
                  <span className={styles.listMeta}>
                    <PatchStatusChip status={p.status} />
                    <span>{nameOf(p.authorId)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <h2>{selected.title}</h2>
                <PatchStatusChip status={selected.status} />
              </div>
              <div className={styles.meta}>
                By {nameOf(selected.authorId)} on <span className="mono-id">{selected.urlPath}</span>, revision{' '}
                <span className="num">{selected.revision}</span>, updated {formatWhen(selected.updatedAt)}
              </div>
              {selected.description ? <p className="prose">{selected.description}</p> : null}

              <h3 className={styles.subhead}>Operations</h3>
              <div className={styles.scroll}>
              <table className="table">
                <tbody>
                  {selected.ops.map((op, i) => (
                    <tr key={i}>
                      <td className="num">{i + 1}</td>
                      <td>{describePatchOp(op)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              <h3 className={styles.subhead}>Checks run before release</h3>
              {selected.checks.length === 0 ? (
                <p className={styles.small}>No checks. Verification will only confirm the patch applies.</p>
              ) : (
                <ol className={styles.small}>
                  {selected.checks.map((c, i) => (
                    <li key={i}>
                      {c.action} {'target' in c ? c.target : ''} {'contains' in c ? `“${c.contains}”` : ''}
                      {'path' in c ? c.path : ''}
                    </li>
                  ))}
                </ol>
              )}

              {isAuthor ? (
                <Notice>You wrote this patch, so switch to the Reviewer to approve or merge it.</Notice>
              ) : null}

              <div className={styles.actions}>
                <button
                  className="btn"
                  type="button"
                  disabled={action.busy !== null}
                  onClick={() =>
                    void action.run('conflicts', async () => setReport(await api.conflicts(projectId, [selected.id])))
                  }
                >
                  Check conflicts
                </button>
                {selected.status === 'in_review' ? (
                  <button
                    className="btn btn--primary"
                    type="button"
                    disabled={action.busy !== null || isAuthor}
                    onClick={() =>
                      void action.run('approve', () =>
                        api.reviewPatch(selected.id, { decision: 'approve', comment: comment || 'Approved.' }),
                      )
                    }
                  >
                    Approve
                  </button>
                ) : null}
                {selected.status === 'approved' ? (
                  <button
                    className="btn btn--primary"
                    type="button"
                    disabled={action.busy !== null || isAuthor}
                    onClick={() => void merge(selected, [])}
                  >
                    Merge
                  </button>
                ) : null}
              </div>
              <div className={styles.actions}>
                <input
                  className={styles.field}
                  name="review-comment"
                  autoComplete="off"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What should change? e.g. use the sale price from the brief…"
                  aria-label="Review comment"
                />
                <button
                  className="btn"
                  type="button"
                  disabled={action.busy !== null || isAuthor || comment.trim() === ''}
                  onClick={() =>
                    void action.run('changes', async () => {
                      await api.reviewPatch(selected.id, { decision: 'request_changes', comment });
                      setComment('');
                    })
                  }
                >
                  Request changes
                </button>
              </div>

              {action.error ? <ErrorNotice error={action.error} /> : null}

              {report ? (
                <>
                  <h3 className={styles.subhead}>
                    Conflict check against {report.againstIds.length} merged patch
                    {report.againstIds.length === 1 ? '' : 'es'}
                  </h3>
                  {report.conflicts.length === 0 ? (
                    <Notice>No conflicts on this page. Safe to merge.</Notice>
                  ) : (
                    <div className={styles.stack}>
                      {report.blocking ? (
                        <Notice tone="error" title="Merge blocked">
                          A blocking conflict needs a decision. Choose to let this patch override, or ask the
                          author to edit it.
                        </Notice>
                      ) : null}
                      {report.conflicts.map((c) => (
                        <ConflictCard
                          key={c.id}
                          conflict={c}
                          titleOf={titleOf}
                          busy={action.busy !== null}
                          onOverride={
                            selected.status === 'approved' &&
                            c.severity === 'blocking' &&
                            c.resolutions.includes('candidate_overrides') &&
                            !isAuthor
                              ? () => void overrideAll(selected, report)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
