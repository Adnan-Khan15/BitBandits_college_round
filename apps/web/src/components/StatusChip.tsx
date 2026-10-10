import type { ReactNode } from 'react';
import styles from './StatusChip.module.css';

export type Tone = 'neutral' | 'healthy' | 'atrisk' | 'broken' | 'info';

/** Status is never colour alone: every chip carries a glyph and its word. */
export function Chip({ tone, glyph, children }: { tone: Tone; glyph?: string; children: ReactNode }) {
  return (
    <span className={`${styles.chip} ${styles[tone]}`}>
      {glyph ? <span aria-hidden="true" className={styles.glyph}>{glyph}</span> : null}
      {children}
    </span>
  );
}

const PATCH_STATUS: Record<string, { tone: Tone; glyph: string; label: string }> = {
  draft: { tone: 'neutral', glyph: '✎', label: 'draft' },
  in_review: { tone: 'info', glyph: '◔', label: 'in review' },
  changes_requested: { tone: 'atrisk', glyph: '↺', label: 'changes requested' },
  approved: { tone: 'healthy', glyph: '✓', label: 'approved' },
  merged: { tone: 'healthy', glyph: '⇄', label: 'merged' },
  rejected: { tone: 'broken', glyph: '✕', label: 'rejected' },
};

const RESOLUTION_STATUS: Record<string, { tone: Tone; glyph: string; label: string }> = {
  exact: { tone: 'healthy', glyph: '=', label: 'exact' },
  relocated: { tone: 'healthy', glyph: '→', label: 'relocated' },
  ambiguous: { tone: 'atrisk', glyph: '?', label: 'ambiguous' },
  not_found: { tone: 'broken', glyph: '✕', label: 'not found' },
};

const RELEASE_STATUS: Record<string, { tone: Tone; glyph: string; label: string }> = {
  candidate: { tone: 'neutral', glyph: '◇', label: 'candidate' },
  verifying: { tone: 'info', glyph: '◔', label: 'verifying' },
  verified: { tone: 'healthy', glyph: '✓', label: 'verified' },
  verification_failed: { tone: 'broken', glyph: '✕', label: 'verification failed' },
  live: { tone: 'healthy', glyph: '●', label: 'live' },
  superseded: { tone: 'neutral', glyph: '○', label: 'superseded' },
  rolled_back: { tone: 'atrisk', glyph: '↩', label: 'rolled back' },
};

const DEPLOYMENT_STATUS: Record<string, { tone: Tone; glyph: string; label: string }> = {
  in_progress: { tone: 'info', glyph: '◔', label: 'in progress' },
  healthy: { tone: 'healthy', glyph: '✓', label: 'healthy' },
  failed: { tone: 'broken', glyph: '✕', label: 'failed' },
  rolled_back: { tone: 'atrisk', glyph: '↩', label: 'rolled back' },
};

const PATCH_HEALTH: Record<string, { tone: Tone; glyph: string; label: string }> = {
  healthy: { tone: 'healthy', glyph: '✓', label: 'healthy' },
  healed: { tone: 'healthy', glyph: '↻', label: 'healed' },
  at_risk: { tone: 'atrisk', glyph: '!', label: 'at risk' },
  broken: { tone: 'broken', glyph: '✕', label: 'broken' },
};

function lookup(table: Record<string, { tone: Tone; glyph: string; label: string }>, value: string) {
  return table[value] ?? { tone: 'neutral' as Tone, glyph: '·', label: value };
}

export const PatchStatusChip = ({ status }: { status: string }) => {
  const { tone, glyph, label } = lookup(PATCH_STATUS, status);
  return <Chip tone={tone} glyph={glyph}>{label}</Chip>;
};

export const ResolutionStatusChip = ({ status }: { status: string }) => {
  const { tone, glyph, label } = lookup(RESOLUTION_STATUS, status);
  return <Chip tone={tone} glyph={glyph}>{label}</Chip>;
};

export const ReleaseStatusChip = ({ status }: { status: string }) => {
  const { tone, glyph, label } = lookup(RELEASE_STATUS, status);
  return <Chip tone={tone} glyph={glyph}>{label}</Chip>;
};

export const DeploymentStatusChip = ({ status }: { status: string }) => {
  const { tone, glyph, label } = lookup(DEPLOYMENT_STATUS, status);
  return <Chip tone={tone} glyph={glyph}>{label}</Chip>;
};

export const PatchHealthChip = ({ health }: { health: string }) => {
  const { tone, glyph, label } = lookup(PATCH_HEALTH, health);
  return <Chip tone={tone} glyph={glyph}>{label}</Chip>;
};
