// apps/web/src/screens/HistoryScreen.tsx (owner: Dev D)
// History: the tamper-evident audit chain as a timeline of sentences, with who did what.
import { useState } from 'react';
import type { AuditEvent, Patch, Release, User } from '@patchwork/shared';
import { api } from '../api.js';
import { usePoll } from '../usePoll.js';
import { EmptyState, ErrorNotice } from '../components/Notice.js';
import { Chip } from '../components/StatusChip.js';
import { nameOf } from '../team.js';
import { firstProject } from './shared.js';
import styles from './History.module.css';

interface HistoryData {
  events: AuditEvent[];
  chain: { valid: boolean; brokenAtSeq: number | null } | null;
  patches: Patch[];
  releases: Release[];
  users: User[];
}

const FILTERS = [
  { key: 'fixes', label: 'Fixes', types: ['patch.created', 'patch.updated', 'patch.submitted', 'patch.merged', 'patch.rejected', 'patch.heal_proposed'] },
  { key: 'reviews', label: 'Reviews', types: ['patch.reviewed'] },
  { key: 'conflicts', label: 'Conflicts', types: ['conflict.detected', 'conflict.resolved'] },
  { key: 'releases', label: 'Releases', types: ['release.created', 'release.deployed', 'release.force_deployed', 'deployment.healthy', 'deployment.failed', 'verification.finished'] },
  { key: 'rollbacks', label: 'Rollbacks', types: ['release.rolled_back', 'release.auto_rolled_back'] },
  { key: 'drift', label: 'Drift', types: ['drift.detected', 'release.quarantine_proposed'] },
] as const;

const ICON: Record<string, string> = {
  fixes: '✎',
  reviews: '✓',
  conflicts: '⚠',
  releases: '▲',
  rollbacks: '↩',
  drift: '≈',
};

function groupOf(type: string): string {
  return FILTERS.find((f) => (f.types as readonly string[]).includes(type))?.key ?? 'other';
}

export function HistoryScreen() {
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const { data, error, loading } = usePoll<HistoryData | null>(async () => {
    const project = await firstProject();
    if (!project) return null;
    const [audit, chain, patches, releases, users] = await Promise.all([
      api.audit(project.id, { limit: 500 }),
      api.auditVerify(project.id),
      api.patches(project.id),
      api.releases(project.id),
      api.users(),
    ]);
    return { events: audit.items, chain, patches: patches.items, releases: releases.items, users: users.items };
  }, 3000);

  if (loading && !data) return <p className={styles.small}>Loading history…</p>;
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <EmptyState>No project yet. Run <code>patchwork</code> to start and seed ShopLite.</EmptyState>;

  const { events, chain, patches, releases, users } = data;
  const title = (id: string) => `“${patches.find((p) => p.id === id)?.title ?? 'a fix'}”`;
  const rel = (id: unknown) => {
    if (id === null || id === 'none') return 'the original site';
    const r = releases.find((x) => x.id === id);
    return r ? `R${r.number}` : 'an earlier release';
  };

  const sentence = (e: AuditEvent): string => {
    const who = nameOf(users, e.actorId);
    const d = e.data as Record<string, unknown>;
    const subj = e.subject.id;
    switch (e.type) {
      case 'patch.created':
        return `${who} drafted ${title(subj)}`;
      case 'patch.updated':
        return `${who} edited ${title(subj)}`;
      case 'patch.submitted':
        return `${who} sent ${title(subj)} for review`;
      case 'patch.reviewed':
        return d.decision === 'approve'
          ? `${who} approved ${title(subj)}`
          : d.decision === 'request_changes'
            ? `${who} asked for changes to ${title(subj)}`
            : `${who} commented on ${title(subj)}`;
      case 'patch.merged':
        return `${who} merged ${title(subj)}`;
      case 'patch.rejected':
        return `${who} rejected ${title(subj)}`;
      case 'patch.heal_proposed':
        return `PATCHWORK proposed a healed version of ${title(subj)}`;
      case 'conflict.detected': {
        const n = Array.isArray(d.conflicts) ? d.conflicts.length : 0;
        return `${title(subj)} ran into ${n} conflict${n === 1 ? '' : 's'} with merged fixes`;
      }
      case 'conflict.resolved':
        return `${who} let ${title(subj)} override a conflicting fix`;
      case 'release.created': {
        const n = Array.isArray(d.patches) ? d.patches.length : 0;
        return `${who} created ${rel(subj)} with ${n} fix${n === 1 ? '' : 'es'}`;
      }
      case 'verification.finished': {
        const s = d.subject as { kind?: string; releaseId?: string } | undefined;
        const what = s?.kind === 'release' ? rel(s.releaseId) : s?.kind === 'live' ? 'the live site' : 'a preview';
        return `A real browser tested ${what}: ${d.status === 'passed' ? 'passed' : 'found a problem'}`;
      }
      case 'release.deployed':
        return `${who} deployed ${rel(subj)}`;
      case 'release.force_deployed':
        return `${who} force-deployed ${rel(subj)}${d.reason ? `: “${String(d.reason)}”` : ''}`;
      case 'deployment.healthy':
        return `${rel(d.releaseId)} passed its live health check`;
      case 'deployment.failed':
        return `${rel(d.releaseId)} failed its live health check`;
      case 'release.rolled_back':
        return `${who} rolled back to ${rel(d.toReleaseId)}`;
      case 'release.auto_rolled_back':
        return `PATCHWORK automatically rolled back to ${rel(d.toReleaseId)}`;
      case 'drift.detected':
        return `ShopLite changed the ${String(d.path)} page; PATCHWORK re-checked the live fixes there`;
      case 'release.quarantine_proposed':
        return `${who} built safe release ${rel(subj)} without the fixes that lost their element`;
      default:
        return e.type;
    }
  };

  // Previews are opened constantly while editing; they are in the chain but not in this story.
  const story = events.filter((e) => e.type !== 'preview.created');
  const shown = filter ? story.filter((e) => groupOf(e.type) === filter) : story;

  return (
    <section className={styles.history}>
      <div className={styles.head}>
        <h1>History</h1>
        {chain ? (
          chain.valid ? (
            <Chip tone="healthy" glyph="✓">
              Tamper-evident log: chain intact ({events.length} events)
            </Chip>
          ) : (
            <Chip tone="broken" glyph="✕">
              Chain broken at event #{chain.brokenAtSeq}
            </Chip>
          )
        ) : null}
      </div>
      <details className={styles.how}>
        <summary>How this works</summary>
        <p>
          Every event stores a fingerprint (SHA-256) of its own content plus the fingerprint of the event before it. Changing
          or deleting any past event breaks every fingerprint after it, and the check above turns red.
        </p>
      </details>

      <div className={styles.filters} role="group" aria-label="Show only">
        <button type="button" className={styles.filter} aria-pressed={filter === null} onClick={() => setFilter(null)}>
          Everything
        </button>
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={styles.filter} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            <span aria-hidden="true">{ICON[f.key]}</span> {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState>Nothing here yet. Fixes, reviews and releases appear as they happen.</EmptyState>
      ) : (
        <ol className={styles.timeline}>
          {shown.map((e) => {
            const group = groupOf(e.type);
            const d = e.data as Record<string, unknown>;
            // failures never wear a success icon: status is icon + word, never colour alone
            const bad =
              e.type === 'deployment.failed' ||
              e.type === 'release.auto_rolled_back' ||
              e.type === 'conflict.detected' ||
              (e.type === 'verification.finished' && d.status !== 'passed');
            const actor = nameOf(users, e.actorId);
            return (
              <li key={e.id} className={`${styles.event} ${bad ? styles.bad : (styles[group] ?? '')}`}>
                <span className={styles.avatar} aria-hidden="true">
                  {e.actorId === 'system' ? '⚙' : actor.slice(0, 1)}
                </span>
                <div className={styles.body}>
                  <p className={styles.sentence}>
                    <span className={styles.icon} aria-hidden="true">
                      {bad ? '✕' : (ICON[group] ?? '•')}
                    </span>{' '}
                    {sentence(e)}
                  </p>
                  <span className={styles.meta}>
                    {new Date(e.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                    <button type="button" className={styles.details} aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                      details
                    </button>
                  </span>
                  {open === e.id ? (
                    <pre className={styles.raw}>
                      {JSON.stringify({ event: e.seq, type: e.type, data: e.data, hash: e.hash, previous: e.prevHash }, null, 2)}
                    </pre>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
