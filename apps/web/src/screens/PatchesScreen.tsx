import { useState } from 'react';
import type { Patch, Project, User } from '@patchwork/shared';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { EmptyState, ErrorNotice, Notice } from '../components/Notice.js';
import { PatchStatusChip } from '../components/StatusChip.js';
import styles from './PatchesScreen.module.css';

const STATUS_FILTERS: Array<{ key: string | null; label: string }> = [
  { key: null, label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'in_review', label: 'In review' },
  { key: 'changes_requested', label: 'Changes requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'merged', label: 'Merged' },
  { key: 'rejected', label: 'Rejected' },
];

interface PatchesData {
  project: Project | null;
  patches: Patch[];
  users: User[];
}

function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}

export function PatchesScreen() {
  const [status, setStatus] = useState<string | null>(null);

  const { data, error, loading, reload } = usePoll<PatchesData>(async () => {
    const [projects, users] = await Promise.all([api.projects(), api.users()]);
    const project = projects.items[0] ?? null;
    if (!project) return { project: null, patches: [], users: users.items };
    const patches = await api.patches(project.id, status ?? undefined);
    return { project, patches: patches.items, users: users.items };
  });

  if (loading && !data) return <p className={styles.loading}>Loading patches…</p>;
  if (error) return <ErrorNotice error={error} />;
  if (!data?.project) {
    return <EmptyState>No project yet. Run <code>npm run reset</code> to seed ShopLite.</EmptyState>;
  }

  const { patches, users } = data;
  const authorName = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  return (
    <section>
      <div className={styles.head}>
        <h1>Patches</h1>
        <span className={styles.newPatch}>
          <button className="btn" type="button" disabled>
            New patch
          </button>
          <span className={styles.newPatchWhy}>opens with the editor in step 7</span>
        </span>
      </div>

      <div className={styles.filters} role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            className={`btn ${status === filter.key ? 'btn--primary' : ''}`}
            aria-pressed={status === filter.key}
            onClick={() => {
              setStatus(filter.key);
              reload();
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {patches.length === 0 ? (
        <EmptyState>
          {status
            ? `No ${STATUS_FILTERS.find((f) => f.key === status)?.label.toLowerCase()} patches.`
            : 'No patches yet. The first one starts in the editor.'}
        </EmptyState>
      ) : (
        <table className="table table--rows">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th className="num">Rev</th>
              <th>Author</th>
              <th>Path</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {patches.map((patch) => (
              <tr key={patch.id}>
                <td>
                  <strong>{patch.title}</strong>
                  {patch.description ? <div className={styles.desc}>{patch.description}</div> : null}
                </td>
                <td><PatchStatusChip status={patch.status} /></td>
                <td className="num">{patch.revision}</td>
                <td>{authorName(patch.authorId)}</td>
                <td className="mono-id">{patch.urlPath}</td>
                <td className={styles.when}>{formatWhen(patch.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className={styles.footnote}>
        Polls every 2 s and pauses while this tab is hidden.
      </p>
    </section>
  );
}
