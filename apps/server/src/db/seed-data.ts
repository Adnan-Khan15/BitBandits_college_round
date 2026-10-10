// apps/server/src/db/seed-data.ts (owner: Dev A)
// The deterministic fixture data every environment shares (PLAN section 17):
// four users and the one ShopLite project. Used by scripts/seed.ts and tests.
export const SEED_USERS = [
  { id: 'usr_dev1', name: 'Gaurav', role: 'developer' },
  { id: 'usr_dev2', name: 'Adnan', role: 'developer' },
  { id: 'usr_rev', name: 'Vishwaa', role: 'reviewer' },
  { id: 'usr_rm', name: 'Kshant', role: 'release_manager' },
] as const;

export const SEED_PROJECT = {
  id: 'prj_shoplite',
  name: 'ShopLite',
  upstreamOrigin: 'http://localhost:4200',
  paths: ['/', '/cart', '/checkout'],
  createdAt: '2026-10-10T00:00:00.000Z',
} as const;
