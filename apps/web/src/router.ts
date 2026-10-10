// apps/web/src/router.ts (owner: Dev D)
// Tiny hash router: no dependency, works from file:// and behind proxies alike.
import { useEffect, useState } from 'react';

function readHash(): string[] {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return raw.split('/').filter((segment) => segment.length > 0);
}

export function useRoute(): string[] {
  const [segments, setSegments] = useState<string[]>(readHash);

  useEffect(() => {
    const onChange = () => setSegments(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return segments;
}

export function routeHref(to: string): string {
  return `#/${to.replace(/^\/+/, '')}`;
}

export function navigate(to: string): void {
  window.location.hash = routeHref(to);
}
