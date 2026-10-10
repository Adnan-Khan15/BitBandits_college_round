// apps/web/src/env.ts (owner: Dev D)
// Origins the browser app needs. Vite injects VITE_* at build time; defaults
// match .env.example (PLAN 11.16) so `npm run dev` needs no env file.

function read(key: string, fallback: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return value && value.length > 0 ? value : fallback;
}

/** Preview gateway — the editor's iframe source. */
export const PREVIEW_ORIGIN = read('VITE_PREVIEW_ORIGIN', 'http://localhost:4300');
/** Live gateway — never previewed from, only shown as a comparison link. */
export const LIVE_ORIGIN = read('VITE_LIVE_ORIGIN', 'http://localhost:4100');
/** ShopLite demo upstream — the "simulate upstream redeploy" control. */
export const TARGET_ORIGIN = read('VITE_TARGET_ORIGIN', 'http://localhost:4200');
/** Editor origin — what the runtime's postMessage bridge accepts. */
export const EDITOR_ORIGIN = read('VITE_EDITOR_ORIGIN', 'http://localhost:5173');
