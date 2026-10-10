import { useRoute } from './router.js';
import { api } from './api.js';
import { usePoll } from './usePoll.js';
import { Header } from './components/Header.js';
import { NavRail } from './components/NavRail.js';
import { Notice } from './components/Notice.js';
import { OverviewScreen } from './screens/OverviewScreen.js';
import { PatchesScreen } from './screens/PatchesScreen.js';
import { EditorScreen } from './editor/EditorScreen.js';
import { ReviewScreen } from './screens/ReviewScreen.js';
import { ReleasesScreen } from './screens/ReleasesScreen.js';
import { DriftAuditScreen } from './screens/DriftAuditScreen.js';
import styles from './App.module.css';


export function App() {
  const segments = useRoute();
  const section = segments[0] ?? '';
  const knownScreens = ['', 'patches', 'editor', 'review', 'releases', 'drift', 'audit'];

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
          {section === 'review' ? <ReviewScreen /> : null}
          {section === 'releases' ? <ReleasesScreen /> : null}
          {section === 'drift' || section === 'audit' ? <DriftAuditScreen /> : null}
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
