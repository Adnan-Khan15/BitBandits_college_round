import { useEffect } from 'react';
import { useRoute } from './router.js';
import { api } from './api.js';
import { usePoll } from './usePoll.js';
import { Header } from './components/Header.js';
import { Notice } from './components/Notice.js';
import { StudioScreen } from './studio/StudioScreen.js';
import { ReviewScreen } from './screens/ReviewScreen.js';
import { ReleasesScreen } from './screens/ReleasesScreen.js';
import { DriftAuditScreen } from './screens/DriftAuditScreen.js';
import { ensureDefaultUser } from './team.js';
import styles from './App.module.css';

/** Old links keep working: each earlier screen maps to where its job lives now. */
const ALIASES: Record<string, string> = {
  '': 'studio',
  editor: 'studio',
  patches: 'studio',
  releases: 'ship',
  audit: 'history',
};

export function App() {
  const segments = useRoute();
  const raw = segments[0] ?? '';
  const section = ALIASES[raw] ?? raw;

  useEffect(() => ensureDefaultUser(), []);

  const { data: inbox } = usePoll(async () => {
    const project = (await api.projects()).items[0];
    if (!project) return 0;
    const all = (await api.patches(project.id)).items;
    return all.filter((p) => p.status === 'in_review' || p.status === 'approved').length;
  }, 3000);

  const known = ['studio', 'review', 'ship', 'drift', 'history'];

  return (
    <div className={styles.app}>
      <Header active={section} inbox={inbox ?? null} />
      <main className={section === 'studio' ? styles.full : styles.main}>
        {section === 'studio' ? <StudioScreen /> : null}
        {section === 'review' ? <ReviewScreen /> : null}
        {section === 'ship' ? <ReleasesScreen /> : null}
        {section === 'drift' || section === 'history' ? <DriftAuditScreen /> : null}
        {!known.includes(section) ? (
          <Notice tone="error" title="Page not found">
            There is no page called “{raw}”. <a href="#/studio">Go to the Studio</a>.
          </Notice>
        ) : null}
      </main>
    </div>
  );
}
