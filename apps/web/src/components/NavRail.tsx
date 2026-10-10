import { routeHref, useRoute } from '../router.js';
import styles from './NavRail.module.css';

interface Item {
  to: string;
  label: string;
  step?: string;
}

const ITEMS: Item[] = [
  { to: '', label: 'Overview' },
  { to: 'patches', label: 'Patches' },
  { to: 'editor', label: 'Editor', step: 'step 7' },
  { to: 'review', label: 'Review & merge', step: 'step 8' },
  { to: 'releases', label: 'Releases', step: 'step 9' },
  { to: 'drift', label: 'Drift Sentinel', step: 'step 10' },
  { to: 'audit', label: 'Audit', step: 'step 11' },
];

export function NavRail({ patchCount }: { patchCount: number | null }) {
  const segments = useRoute();
  const active = segments[0] ?? '';

  return (
    <nav className={styles.rail} aria-label="Sections">
      {ITEMS.map((item) => {
        const key = item.to === '' ? '' : item.to;
        const isActive = key === active;
        const showCount = item.to === 'patches' && patchCount !== null;
        return (
          <a
            key={item.to}
            href={routeHref(item.to)}
            aria-current={isActive ? 'page' : undefined}
            className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
          >
            <span className={styles.label}>{item.label}</span>
            {showCount ? <span className={`${styles.count} num`}>{patchCount}</span> : null}
            {item.step ? <span className={styles.step}>{item.step}</span> : null}
          </a>
        );
      })}
    </nav>
  );
}
