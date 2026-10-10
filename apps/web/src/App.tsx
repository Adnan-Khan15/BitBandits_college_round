import { useRoute } from './router.js';
import { api } from './api.js';
import { usePoll } from './usePoll.js';
import { Header } from './components/Header.js';
import { NavRail } from './components/NavRail.js';
import { Notice } from './components/Notice.js';
import { OverviewScreen } from './screens/OverviewScreen.js';
import { PatchesScreen } from './screens/PatchesScreen.js';
import { EditorScreen } from './editor/EditorScreen.js';
import styles from './App.module.css';

/** Screens that are planned but not built yet are named honestly, with their step. */
const PLANNED: Record<string, string> = {
  review: 'Review and merge: conflict cards, evidence and resolution choices.',
  releases: 'Releases: verify, deploy, health and rollback.',
  drift: 'Drift Sentinel: re-anchor evidence, heal proposals and quarantine releases.',
  audit: 'Audit: the hash-chained trail of every change.',
};

export function App() {
  const segments = useRoute();
  const section = segments[0] ?? '';
  const knownScreens = ['', 'patches', 'editor', ...Object.keys(PLANNED)];

  const { data } = usePoll(async () => {
    const projects = await api.projects();
    const project = projects.items[0] ?? null;
    if (!project) return null;
    const patches = await api.patches(project.id);
    return patches.items.length;
  });

  return (
    <div className={styles.app}>
      <Header />
      <div className={styles.body}>
        <NavRail patchCount={data ?? null} />
        <main className={styles.main}>
          {section === '' ? <OverviewScreen /> : null}
          {section === 'patches' ? <PatchesScreen /> : null}
          {section === 'editor' ? <EditorScreen /> : null}
          {PLANNED[section] ? (
            <Notice tone="empty" title={`Not built yet — ${section}`}>
              {PLANNED[section]} Planned for {section} in the phase plan; nothing here is mocked.
            </Notice>
          ) : null}
          {!knownScreens.includes(section) ? (
            <Notice tone="error" title="Not found">
              No screen called “{section}”. <a href="#/">Back to overview</a>.
            </Notice>
          ) : null}
        </main>
      </div>
    </div>
  );
}
