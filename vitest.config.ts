import { defineConfig } from 'vitest/config'

// Root test runner for every workspace (owner: Dev A).
// DOM-based unit tests (engine, runtime) opt in per file with the docblock
// `// @vitest-environment jsdom`.
export default defineConfig({
  test: {
    include: [
      'packages/**/src/**/*.test.ts',
      'packages/**/test/**/*.test.ts',
      'apps/**/src/**/*.test.ts',
      'apps/**/test/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', 'fixtures/**'],
    environment: 'node',
  },
})
