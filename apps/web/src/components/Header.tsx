import { routeHref, useRoute } from '../router.js';
import { ROLE_LABEL, useTeam } from '../team.js';
import { setCurrentUserId, useCurrentUserId } from '../user.js';
import styles from './Header.module.css';

export const NAV = [
  { to: 'studio', label: 'Studio' },
  { to: 'review', label: 'Review' },
  { to: 'ship', label: 'Ship' },
  { to: 'drift', label: 'Drift Sentinel' },
  { to: 'history', label: 'History' },
] as const;

/** Header: brand, the five places, and the team bar (who you are acting as, one click to switch). */
export function Header({ active, inbox }: { active: string; inbox: number | null }) {
  const team = useTeam();
  const currentUserId = useCurrentUserId();
  useRoute();

  return (
    <header className={styles.header}>
      <a className={styles.brand} href={routeHref('studio')}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.name}>PATCHWORK</span>
      </a>

      <nav className={styles.nav} aria-label="Sections">
        {NAV.map((item) => (
          <a
            key={item.to}
            href={routeHref(item.to)}
            className={styles.navItem}
            aria-current={active === item.to ? 'page' : undefined}
          >
            {item.label}
            {item.to === 'review' && inbox ? <span className={`${styles.count} num`}>{inbox}</span> : null}
          </a>
        ))}
      </nav>

      <div className={styles.team} role="group" aria-label="Acting as">
        {team.map((user) => {
          const on = user.id === currentUserId;
          return (
            <button
              key={user.id}
              type="button"
              className={styles.person}
              aria-pressed={on}
              title={`Act as ${user.name} (${ROLE_LABEL[user.role]})`}
              onClick={() => setCurrentUserId(user.id)}
            >
              <span className={`${styles.avatar} ${styles[user.role]}`} aria-hidden="true">
                {user.name.slice(0, 1)}
              </span>
              <span className={styles.who}>
                <span className={styles.personName}>{user.name}</span>
                <span className={styles.personRole}>{ROLE_LABEL[user.role]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
