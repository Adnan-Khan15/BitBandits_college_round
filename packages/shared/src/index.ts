// packages/shared/src/index.ts (owner: Dev A)
// The single import surface for every other workspace: types, constants, errors, api, services.
// Nothing in shared imports from another workspace (PLAN 11.17).

export * from './types.js';
export * from './constants.js';
export * from './errors.js';
export * from './api.js';
export * from './services.js';
export * from './schemas.js';
