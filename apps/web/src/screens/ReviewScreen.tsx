// apps/web/src/screens/ReviewScreen.tsx (owner: Dev D)
// Review: the inbox of fixes waiting for a teammate. Each fix in plain words, a conflict check on
// the element itself, and actions that say who does them ("Approve as Vishwaa").
import { useState } from 'react';
import type { Conflict, ConflictReport, ConflictResolutionChoice, Patch, User } from '@patchwork/shared';
import { api, isApiClientError } from '../api.js';
import { usePoll } from '../usePoll.js';
import { EmptyState, ErrorNotice, Notice } from '../components/Notice.js';
import { Chip, PatchStatusChip } from '../components/StatusChip.js';
import { actAs, nameOf, personFor, ROLE_LABEL } from '../team.js';
import { useCurrentUserId } from '../user.js';
import { anchorLabel, describePatchOp, firstProject, formatWhen, propertyWords } from './shared.js';
import { stepText } from '../studio/fixes.js';
import styles from './Screens.module.css';

interface ReviewData {
  projectId: string | null;
  waiting: Patch[];
  all: Patch[];
  users: User[];
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const pageName = (path: string): string => (path === '/' ? 'the home page' : `the ${path} page`);

/** "Adnan's “Fix price typo” also changes the text of “₹12,99”: theirs ₹1,299, this fix ₹1,199." */
function conflictSentence(c: Conflict, all: Patch[], users: User[], candidate: Patch): string {
  const other = c.patchIds[1] ? all.find((p) => p.id === c.patchIds[1]) : null;
  const keys = Object.keys(candidate.anchors);
  const elementName = keys.length === 1 ? anchorLabel(candidate.anchors, keys[0]!) : 'one of the same elements';
  if (!other) {
    if (c.type === 'UNRESOLVED_TARGET') return "This fix's element can't be found on the current page any more.";
    if (c.type === 'AMBIGUOUS_TARGET') return "This fix's element matches more than one thing on the page.";
    return c.message;
  }
  const who = `${nameOf(users, other.authorId)}'s “${other.title}”`;
  const values =
    c.values && (c.values.existing !== null || c.values.candidate !== null)
      ? `: theirs ${c.values.existing ?? '—'}, this fix ${c.values.candidate ?? '—'}`
      : '';
  if (c.type === 'TEXT_OVERWRITES_CHILD') return `${who} edits something inside ${elementName}, and this fix replaces its whole text.`;
  if (c.type === 'EDIT_HIDDEN') return `${who} hides ${elementName}, so this change may never be seen.`;
  if (c.type === 'INSERT_ORDER') return `${who} also adds content at the same spot.`;
  if (c.type === 'STALE_BASE') return `${elementName} changed since this fix was made${values}.`;
  return `${who} also ${propertyWords(c.property)} ${elementName}${values}.`;
}

export function ReviewScreen() {
  const userId = useCurrentUserId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [report, setReport] = useState<ConflictReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const { data, error: loadError, loading, reload } = usePoll<ReviewData>(async () => {
    const [project, users] = await Promise.all([firstProject(), api.users()]);
    if (!project) return { projectId: null, waiting: [], all: [], users: users.items };
    const all = (await api.patches(project.id)).items;
    const waiting = all.filter((p) => p.status === 'in_review' || p.status === 'approved' || p.status === 'changes_requested');
    return { projectId: project.id, waiting, all, users: users.items };
  });

  if (loading && !data) return <p className={styles.small}>Loading the review inbox…</p>;
  if (loadError) return <ErrorNotice error={loadError} />;
  if (!data?.projectId) return <EmptyState>No project yet. Run <code>patchwork</code> to start and seed ShopLite.</EmptyState>;

  const { waiting, all, users, projectId } = data;
  const selected = waiting.find((p) => p.id === selectedId) ?? waiting[0] ?? null;
  const reviewer = personFor(users, 'reviewer');
  const reviewerLabel = reviewer ? `${reviewer.name} (${ROLE_LABEL.reviewer})` : 'the reviewer';

  const doAs = async (label: string, who: User | null, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      if (who) await actAs(who.id, fn);
      else await fn();
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const merge = async (patch: Patch, choices: ConflictResolutionChoice[]) => {
    setNotice(null);
    setBusy('merge');
    setError(null);
    try {
      if (reviewer) await actAs(reviewer.id, () => api.mergePatch(patch.id, { choices }));
      else await api.mergePatch(patch.id, { choices });
      setReport(null);
      setNotice(`“${patch.title}” is merged. It goes out with the next release on Ship.`);
      reload();
    } catch (err) {
      if (isApiClientError(err) && err.code === 'MERGE_BLOCKED' && err.details) setReport(err.details as ConflictReport);
      else setError(err);
    } finally {
      setBusy(null);
    }
  };

  const select = (id: string) => {
    setSelectedId(id);
    setReport(null);
    setNotice(null);
    setError(null);
  };

  return (
    <section>
      <div className={styles.head}>
        <h1>Review</h1>
      </div>
      <p className={styles.lede}>
        Fixes waiting for a teammate. Conflicts are checked on the element itself, against every fix already merged.
        Nobody can approve their own fix.
      </p>

      <div aria-live="polite">{notice ? <Notice title="Merged">{notice}</Notice> : null}</div>

      {waiting.length === 0 ? (
        <EmptyState>Nothing waiting for review. Fixes sent from the Studio land here.</EmptyState>
      ) : (
        <div className={styles.split}>
          <ul className={styles.list} aria-label="Fixes waiting for review">
            {waiting.map((p) => (
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
                    <span>
                      {nameOf(users, p.authorId)}, {pageName(p.urlPath)}, {formatWhen(p.updatedAt)}
                    </span>
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
                By {nameOf(users, selected.authorId)} on {pageName(selected.urlPath)}, {formatWhen(selected.updatedAt)}
              </div>
              {selected.mergedRevision !== null && selected.revision > selected.mergedRevision ? (
                <Notice title="An update to a live fix">
                  Version {selected.mergedRevision} is live. This is version {selected.revision}
                  {selected.revision === selected.mergedRevision + 1 ? '' : ' or later'}, for example re-anchored by Drift
                  Sentinel after the shop changed its page.
                </Notice>
              ) : null}
              {selected.description ? <p className="prose">{selected.description}</p> : null}

              <h3 className={styles.subhead}>What it changes</h3>
              <ul className={styles.plainList}>
                {selected.ops.map((op, i) => (
                  <li key={i}>{describePatchOp(op, selected.anchors)}</li>
                ))}
              </ul>

              <h3 className={styles.subhead}>How a browser will check it</h3>
              {selected.checks.length === 0 ? (
                <p className={styles.small}>No checks. The browser test only confirms the fix applies cleanly.</p>
              ) : (
                <ul className={styles.plainList}>
                  {selected.checks.map((c, i) => (
                    <li key={i}>{cap(stepText(c).replace('the picked element', anchorLabel(selected.anchors, 'a1')))}</li>
                  ))}
                </ul>
              )}

              <div className={styles.actions}>
                <a className="btn" href={`#/studio/fix/${selected.id}`}>
                  Preview this fix
                </a>
                <button
                  className="btn"
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void doAs('conflicts', null, async () => setReport(await api.conflicts(projectId, [selected.id])))
                  }
                >
                  Check for conflicts
                </button>
                {selected.status === 'in_review' ? (
                  <button
                    className="btn btn--primary"
                    type="button"
                    disabled={busy !== null || selected.authorId === reviewer?.id}
                    onClick={() =>
                      void doAs('approve', reviewer, () =>
                        api.reviewPatch(selected.id, { decision: 'approve', comment: comment || 'Approved.' }),
                      )
                    }
                  >
                    Approve as {reviewerLabel}
                  </button>
                ) : null}
                {selected.status === 'approved' ? (
                  <button className="btn btn--primary" type="button" disabled={busy !== null} onClick={() => void merge(selected, [])}>
                    {busy === 'merge' ? 'Merging…' : `Merge as ${reviewer?.name ?? 'the reviewer'}`}
                  </button>
                ) : null}
              </div>
              {selected.status !== 'changes_requested' ? (
                <div className={styles.actions}>
                  <input
                    className={styles.field}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="What should the author change? e.g. keep the button on the cart…"
                    aria-label="Comment for the author"
                    name="review-comment"
                    autoComplete="off"
                  />
                  <button
                    className="btn"
                    type="button"
                    disabled={busy !== null || comment.trim() === ''}
                    onClick={() =>
                      void doAs('changes', reviewer, async () => {
                        await api.reviewPatch(selected.id, { decision: 'request_changes', comment });
                        setComment('');
                      })
                    }
                  >
                    Ask {nameOf(users, selected.authorId)} to change it
                  </button>
                </div>
              ) : (
                <Notice>Waiting for {nameOf(users, selected.authorId)} to update this fix.</Notice>
              )}
              {userId === selected.authorId ? (
                <p className={styles.small}>You wrote this fix, so the buttons act as {reviewerLabel}.</p>
              ) : null}

              {error ? <ErrorNotice error={error} /> : null}

              {report ? (
                <div className={styles.block} aria-live="polite">
                  <h3 className={styles.subhead}>
                    Checked against {report.againstIds.length} merged fix{report.againstIds.length === 1 ? '' : 'es'} on this page
                  </h3>
                  {report.conflicts.length === 0 ? (
                    <Notice>No conflicts. Safe to merge.</Notice>
                  ) : (
                    <div className={styles.stack}>
                      {report.conflicts.map((c) => {
                        const blocking = c.severity === 'blocking';
                        return (
                          <div key={c.id} className={`${styles.conflict} ${blocking ? styles.conflictBlocking : ''}`}>
                            <div className={styles.conflictHead}>
                              <Chip tone={blocking ? 'broken' : 'atrisk'} glyph={blocking ? '✕' : '!'}>
                                {blocking ? 'blocks the merge' : 'worth a look'}
                              </Chip>
                            </div>
                            <p>{conflictSentence(c, all, users, selected)}</p>
                            {blocking && selected.status === 'approved' ? (
                              <div className={styles.actions}>
                                {c.resolutions.includes('candidate_overrides') ? (
                                  <button
                                    className="btn btn--primary"
                                    type="button"
                                    disabled={busy !== null}
                                    onClick={() =>
                                      void merge(selected, [
                                        { conflictId: c.id, choice: 'candidate_overrides', note: `${reviewer?.name ?? 'Reviewer'} kept this fix` },
                                      ])
                                    }
                                  >
                                    Keep this fix (it overrides)
                                  </button>
                                ) : null}
                                <button
                                  className="btn"
                                  type="button"
                                  disabled={busy !== null}
                                  onClick={() =>
                                    void doAs('changes', reviewer, () =>
                                      api.reviewPatch(selected.id, {
                                        decision: 'request_changes',
                                        comment: `Conflicts with another fix: ${conflictSentence(c, all, users, selected)}`,
                                      }),
                                    )
                                  }
                                >
                                  Ask {nameOf(users, selected.authorId)} to change it
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
