// apps/web/src/team.ts (owner: Dev D)
// The team behind the demo: who is who, and "do this as <person>" helpers. Identity is a picker,
// not auth (PLAN 11.12); the server still enforces every role rule.
import { useEffect, useState } from 'react';
import type { Role, User } from '@patchwork/shared';
import { api } from './api.js';
import { getCurrentUserId, setCurrentUserId } from './user.js';

export const ROLE_LABEL: Record<Role, string> = {
  developer: 'Developer',
  reviewer: 'Reviewer',
  release_manager: 'Release manager',
};

export const DEFAULT_USER = 'usr_dev1';

let cache: User[] | null = null;
let inflight: Promise<User[]> | null = null;

export function loadTeam(): Promise<User[]> {
  if (cache) return Promise.resolve(cache);
  inflight ??= api
    .users()
    .then((res) => (cache = res.items))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useTeam(): User[] {
  const [team, setTeam] = useState<User[]>(cache ?? []);
  useEffect(() => {
    let live = true;
    void loadTeam()
      .then((t) => live && setTeam(t))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return team;
}

/** First load: act as Gaurav (Developer) so the Studio works without choosing anyone. */
export function ensureDefaultUser(): void {
  if (!getCurrentUserId()) setCurrentUserId(DEFAULT_USER);
}

/** The first teammate with this role (the seeded team has exactly one reviewer and one release manager). */
export function personFor(team: User[], role: Role): User | null {
  return team.find((u) => u.role === role) ?? null;
}

export function nameOf(team: User[], id: string | null | undefined): string {
  if (!id) return 'someone';
  if (id === 'system') return 'PATCHWORK';
  return team.find((u) => u.id === id)?.name ?? 'a teammate';
}

/** Switch the active person, then run the action as them. */
export async function actAs<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  setCurrentUserId(userId);
  return fn();
}
