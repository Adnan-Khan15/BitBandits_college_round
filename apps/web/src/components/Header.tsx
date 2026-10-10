import { useEffect, useState } from 'react';
import type { Role, User } from '@patchwork/shared';
import { api } from '../api.js';
import { useCurrentUserId, setCurrentUserId } from '../user.js';
import styles from './Header.module.css';

const ROLE_LABEL: Record<Role, string> = {
  developer: 'developer',
  reviewer: 'reviewer',
  release_manager: 'release manager',
};

/**
 * Header: the workbench identity strip. The user switcher is the product's
 * only "auth" (PLAN 11.12) so it is always visible, with the role that
 * choice carries — every screen disables what the role cannot do.
 */
export function Header() {
  const currentUserId = useCurrentUserId();
  const [users, setUsers] = useState<User[] | null>(null);

  useEffect(() => {
    let stopped = false;
    void api
      .users()
      .then((res) => {
        if (!stopped) setUsers(res.items);
      })
      .catch(() => {
        if (!stopped) setUsers([]);
      });
    return () => {
      stopped = true;
    };
  }, []);

  const current = users?.find((u) => u.id === currentUserId) ?? null;

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.name}>PATCHWORK</span>
      </div>

      <div className={styles.user}>
        <label className={styles.userLabel} htmlFor="user-switcher">
          Acting as
        </label>
        <select
          id="user-switcher"
          className={styles.select}
          value={currentUserId ?? ''}
          onChange={(event) => setCurrentUserId(event.target.value || null)}
        >
          <option value="">pick who you are…</option>
          {(users ?? []).map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} — {ROLE_LABEL[user.role]}
            </option>
          ))}
        </select>
        {current ? (
          <span className={styles.role}>{ROLE_LABEL[current.role]}</span>
        ) : (
          <span className={styles.hint}>actions need a user</span>
        )}
      </div>
    </header>
  );
}
