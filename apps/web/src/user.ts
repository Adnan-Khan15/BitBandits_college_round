// apps/web/src/user.ts (owner: Dev D)
// Who am I acting as? Identity is a picker, not auth (PLAN 11.12). The chosen
// user id is remembered in localStorage and sent as X-Patchwork-User on every
// request by api.ts.
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'patchwork.userId';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let currentUserId: string | null = readStored();
const listeners = new Set<() => void>();

export function getCurrentUserId(): string | null {
  return currentUserId;
}

export function setCurrentUserId(id: string | null): void {
  currentUserId = id;
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable (private mode); the picker still works for this session */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCurrentUserId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => currentUserId,
    () => null,
  );
}
