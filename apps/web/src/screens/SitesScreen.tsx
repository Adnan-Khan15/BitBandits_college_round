// apps/web/src/screens/SitesScreen.tsx (owner: Dev D)
// Sites: websites the team owns or runs, connected by address. No code change, no rebuild: the
// gateway serves the site with fixes on top. One site is active at a time.
import { useState } from 'react';
import type { Project, Release, User } from '@patchwork/shared';
import { api } from '../api.js';
import { navigate } from '../router.js';
import { usePoll } from '../usePoll.js';
import { EmptyState, ErrorNotice } from '../components/Notice.js';
import { Chip } from '../components/StatusChip.js';
import { actAs, personFor } from '../team.js';
import { LIVE_ORIGIN } from '../env.js';
import styles from './Sites.module.css';

interface SitesData {
  sites: Project[];
  activeId: string | null;
  releases: Record<string, Release[]>;
  users: User[];
}

export function SitesScreen() {
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('http://localhost:');
  const [pages, setPages] = useState('/');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [connected, setConnected] = useState<string | null>(null);

  const { data, error: loadError, loading, reload } = usePoll<SitesData>(async () => {
    const [sites, users] = await Promise.all([api.projects(), api.users()]);
    const active = await api.activeProject().catch(() => null);
    const releases = Object.fromEntries(
      await Promise.all(sites.items.map(async (s) => [s.id, (await api.releases(s.id)).items] as const)),
    );
    return { sites: sites.items, activeId: active?.id ?? null, releases, users: users.items };
  }, 3000);

  if (loading && !data) return <p className={styles.small}>Loading sites…</p>;
  if (loadError) return <ErrorNotice error={loadError} />;
  if (!data) return null;

  const rm = personFor(data.users, 'release_manager');

  const open = async (site: Project) => {
    setBusy(site.id);
    setError(null);
    try {
      await api.setActiveProject(site.id);
      navigate('studio');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    setBusy('connect');
    setError(null);
    setConnected(null);
    try {
      const paths = pages
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter(Boolean);
      const body = { name, upstreamOrigin: origin, paths: paths.length ? paths : ['/'] };
      const site = rm ? await actAs(rm.id, () => api.connectSite(body)) : await api.connectSite(body);
      setConnected(site.name);
      setName('');
      setOrigin('http://localhost:');
      setPages('/');
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.sites}>
      <h1>Sites</h1>
      <p className={styles.lede}>
        Websites your team owns or runs: a local dev server, a staging address or a static deploy. Connecting one changes
        nothing in its code. PATCHWORK serves it through its own gateway and applies the fixes on top.
      </p>

      {data.sites.length === 0 ? (
        <EmptyState>No sites yet. Connect your first one below.</EmptyState>
      ) : (
        <ul className={styles.list}>
          {data.sites.map((site) => {
            const releases = data.releases[site.id] ?? [];
            const live = releases.find((r) => r.id === site.liveReleaseId);
            const active = site.id === data.activeId;
            return (
              <li key={site.id} className={`${styles.site} ${active ? styles.active : ''}`}>
                <div className={styles.siteMain}>
                  <div className={styles.siteHead}>
                    <h2>{site.name}</h2>
                    {active ? <Chip tone="info" glyph="●">open in the Studio</Chip> : null}
                  </div>
                  <p className={styles.small}>
                    {site.upstreamOrigin}, pages {site.paths.join(', ')}
                  </p>
                  <p className={styles.small}>
                    {live ? `Live: R${live.number} with ${live.patches.length} fix${live.patches.length === 1 ? '' : 'es'}` : 'No fixes live yet'}
                    {active ? (
                      <>
                        {' '}
                        on{' '}
                        <a href={`${LIVE_ORIGIN}${site.paths[0] ?? '/'}`} target="_blank" rel="noreferrer">
                          {LIVE_ORIGIN}
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <button type="button" className={`btn ${active ? '' : 'btn--primary'}`} disabled={busy !== null} onClick={() => void open(site)}>
                  {active ? 'Open in Studio' : 'Switch to this site'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className={styles.connect}
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
      >
        <h2>Connect a site</h2>
        <p className={styles.small}>Only connect sites your team owns or runs.</p>
        <div className={styles.fields}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Team portfolio…" name="site-name" autoComplete="off" required />
          </label>
          <label>
            Address
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="e.g. http://localhost:5500…"
              name="site-origin"
              autoComplete="off"
              spellCheck={false}
              inputMode="url"
              required
            />
          </label>
          <label>
            Pages to track
            <input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="e.g. / /about…" name="site-pages" autoComplete="off" spellCheck={false} />
          </label>
        </div>
        <button type="submit" className="btn btn--primary" disabled={busy !== null || name.trim() === ''}>
          {busy === 'connect' ? 'Connecting…' : `Connect as ${rm?.name ?? 'release manager'}`}
        </button>
        <div aria-live="polite">
          {connected ? <p className={styles.ok}>✓ {connected} is connected. Switch to it to fix it in the Studio.</p> : null}
        </div>
        {error ? <ErrorNotice error={error} /> : null}
      </form>
    </section>
  );
}
