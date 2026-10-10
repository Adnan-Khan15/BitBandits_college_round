// OWNER: Dev D - replace this stub (docs/PLAN.md section 13.6).
// App shell only. The editor, review, releases, drift and audit screens land in Phase 3.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App(): React.JSX.Element {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>PATCHWORK</h1>
      <p>Scaffold build. The editor arrives with Dev D (docs/PLAN.md section 13.6).</p>
    </main>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root missing from index.html');
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
