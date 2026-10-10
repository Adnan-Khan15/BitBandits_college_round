import type { Patch, Project, Release, User } from '@patchwork/shared';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { LIVE_ORIGIN } from '../env.js';
import { EmptyState, ErrorNotice } from '../components/Notice.js';
import { PatchStatusChip, ReleaseStatusChip } from '../components/StatusChip.js';
import styles from './OverviewScreen.module.css';

interface Overview {
  project: Project | null;
  releases: { items: Release[] } | null;
  liveRelease: Release | null;
  patches: Patch[];
  users: User[];
  audit: { valid: boolean; brokenAtSeq: number | null } | null;
}

/**
 * Overview — the state strip. For a tool there is no marketing hero: the first
 * thing you see is the current state of the world — which project, what is
 * live, what is waiting, whether the audit chain still verifies. Each panel
 * degrades on its own: an endpoint that is not implemented yet (stub or 404)
 * takes only its own panel offline, never the whole screen.
 */
export function OverviewScreen() {
  const { data, error, loading } = usePoll<Overview>(async () => {
    const [projects, users] = await Promise.all([api.projects(), api.users()]);
    const project = projects.items[0] ?? null;
    if (!project) {
      return { project: null, releases: null, liveRelease: null, patches: [], users: users.items, audit: null };
    }
    const [patches, releases, audit] = await Promise.all([
      api.patches(project.id),
      api.releases(project.id).catch(() => null),
      api.auditVerify(project.id).catch(() => null),
    ]);
    return {
      project,
      releases,
      liveRelease: releases?.items.find((r) => r.status === 'live') ?? null,
      patches: patches.items,
      users: users.items,
      audit,
    };
  });

  if (loading && !data) return <p className={styles.loading}>Loading the workbench…</p>;
  if (error) return <ErrorNotice error={error} />;
  if (!data?.project) {
    return (
      <EmptyState>
        No project yet. <code>npm run reset</code> seeds ShopLite as{' '}
        <span className="mono-id">prj_shoplite</span>.
      </EmptyState>
    );
  }

  const { project, releases, liveRelease, patches, users, audit } = data;
  const byStatus = (status: string) => patches.filter((p) => p.status === status).length;

  return (
    <section>
      <div className={styles.strip}>
        <div className={styles.identity}>
          <h1>{project.name}</h1>
          <p className={styles.meta}>
            <span className={styles.metaLabel}>upstream</span>{' '}
            <a href={project.upstreamOrigin} target="_blank" rel="noreferrer">{project.upstreamOrigin}</a>
            <span className={styles.metaGap} />
            <span className={styles.metaLabel}>published</span>{' '}
            <a href={LIVE_ORIGIN} target="_blank" rel="noreferrer">live site</a>
          </p>
        </div>
        <div className={styles.stats}>
          <Stat label="patches" value={patches.length} />
          <Stat label="in review" value={byStatus('in_review')} />
          <Stat label="approved" value={byStatus('approved')} />
          <Stat label="merged" value={byStatus('merged')} />
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.panel}>
          <h2>Live release</h2>
          {releases === null ? (
            <p className="prose">
              Release data is not available yet — it lands with Dev C's releases service (step 9).
            </p>
          ) : liveRelease ? (
            <p>
              <strong className="num">R{liveRelease.number}</strong>{' '}
              <ReleaseStatusChip status={liveRelease.status} />
              <br />
              <span className="prose">{liveRelease.note || 'No note.'}</span>
            </p>
          ) : (
            <p className="prose">Nothing is live yet. Create a release and deploy it from Releases.</p>
          )}
        </div>

        <div className={styles.panel}>
          <h2>Tracked paths</h2>
          <ul className={styles.paths}>
            {project.paths.map((path) => (
              <li key={path} className="mono-id">{path}</li>
            ))}
          </ul>
        </div>

        <div className={styles.panel}>
          <h2>Audit chain</h2>
          {audit ? (
            audit.valid ? (
              <p><span aria-hidden="true">✓</span> chain intact</p>
            ) : (
              <p className={styles.broken}>
                <span aria-hidden="true">✕</span> broken at #{audit.brokenAtSeq}
              </p>
            )
          ) : (
            <p className="prose">Unknown.</p>
          )}
        </div>

        <div className={styles.panel}>
          <h2>Recent activity</h2>
          {patches.length === 0 ? (
            <p className="prose">No patches yet.</p>
          ) : (
            <ul className={styles.recent}>
              {[...patches]
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, 4)
                .map((patch) => (
                  <li key={patch.id}>
                    <PatchStatusChip status={patch.status} /> {patch.title}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      <p className={styles.people}>
        {users.length} users on this project: {users.map((u) => u.name).join(', ')}
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statValue} num`}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
