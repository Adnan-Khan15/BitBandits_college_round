// apps/web/src/screens/shared.ts (owner: Dev D)
// Small helpers shared by the Review, Releases and Drift & Audit screens.
import { useCallback, useState } from 'react';
import type { PatchOp, Project } from '@patchwork/shared';
import { api } from '../api.js';

export function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}

export const pct = (value: number): string => `${Math.round(value * 1000) / 10}%`;

/** The one seeded project (the gateway serves PW_PROJECT_ID; the UI shows the first project). */
export async function firstProject(): Promise<Project | null> {
  return (await api.projects()).items[0] ?? null;
}

/** One-line, human description of a patch operation. */
export function describePatchOp(op: PatchOp): string {
  const t = op.target.anchor;
  switch (op.kind) {
    case 'setText':
      return `Set text of ${t} to “${op.value}”`;
    case 'setAttribute':
      return `Set ${op.name} of ${t} to “${op.value}”`;
    case 'removeAttribute':
      return `Remove ${op.name} from ${t}`;
    case 'setStyle':
      return `Set ${op.property} of ${t} to ${op.value}`;
    case 'hide':
      return `Hide ${t}`;
    case 'show':
      return `Show ${t}`;
    case 'move':
      return `Move ${t} ${op.position} ${op.reference.anchor}`;
    case 'insertHTML':
      return `Insert HTML ${op.position} ${t}`;
    case 'setBehavior': {
      const a = op.action;
      const what =
        a.type === 'navigate' ? `go to ${a.url}` : a.type === 'preventDefault' ? 'do nothing' : `${a.type} ${'target' in a ? a.target.anchor : ''}`;
      return `On ${op.event} of ${t}, ${op.mode === 'replace' ? 'instead' : 'first'} ${what}`;
    }
  }
}

/** Runs one user action at a time, keeping its error for an ErrorNotice. */
export function useAction(onDone?: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
      setBusy(label);
      setError(null);
      try {
        const out = await fn();
        onDone?.();
        return out;
      } catch (err) {
        setError(err);
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [onDone],
  );
  return { busy, error, setError, run };
}
