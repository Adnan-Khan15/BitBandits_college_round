// apps/web/src/screens/shared.ts (owner: Dev D)
// Small helpers shared by the Review, Releases and Drift & Audit screens.
import { useCallback, useState } from 'react';
import type { ElementFingerprint, PatchOp, Project } from '@patchwork/shared';
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

/** The active site: the one the live and preview gateways serve now (chosen on the Sites screen). */
export async function firstProject(): Promise<Project | null> {
  try {
    return await api.activeProject();
  } catch {
    return null;
  }
}

/** Human name of an anchor: its visible text, else its accessible name, else its tag. */
export function anchorLabel(anchors: Record<string, ElementFingerprint> | undefined, key: string): string {
  const fp = anchors?.[key];
  if (!fp) return 'an element';
  const text = fp.text || fp.accessibleName || '';
  if (!text) return `the ${fp.tag}`;
  return `“${text.length > 36 ? `${text.slice(0, 36)}…` : text}”`;
}

/** One-line, human description of a patch operation, naming elements by their text. */
export function describePatchOp(op: PatchOp, anchors?: Record<string, ElementFingerprint>): string {
  const t = anchorLabel(anchors, op.target.anchor);
  switch (op.kind) {
    case 'setText':
      return `Change the text of ${t} to “${op.value}”`;
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
      return `Move ${t} ${op.position} ${anchorLabel(anchors, op.reference.anchor)}`;
    case 'insertHTML':
      return `Add a note ${op.position.includes('before') ? 'before' : 'after'} ${t}`;
    case 'setBehavior': {
      const a = op.action;
      if (a.type === 'navigate') return `Make ${t} go to ${a.url} when clicked`;
      if (a.type === 'preventDefault') return `Make clicking ${t} do nothing`;
      return `When ${t} is clicked, ${a.type} ${anchorLabel(anchors, a.target.anchor)}`;
    }
  }
}

/** What a conflicting property means, in words. */
export function propertyWords(property: string | null): string {
  if (!property) return 'changes';
  if (property === 'text') return 'changes the text of';
  if (property === 'visibility') return 'shows or hides';
  if (property === 'position') return 'moves';
  if (property.startsWith('behavior:')) return 'changes what happens when you click';
  if (property.startsWith('style:')) return `changes the ${property.slice(6)} of`;
  if (property.startsWith('attr:')) return `changes the ${property.slice(5)} of`;
  if (property.startsWith('insert:')) return 'adds content at the same spot as';
  return 'changes';
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
