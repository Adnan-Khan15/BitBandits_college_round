// scripts/reset.ts (owner: Dev A)
// Deletes data/ and re-seeds (PLAN section 13.3 step 15, section 17).
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(repoRoot, 'data');

rmSync(dataDir, { recursive: true, force: true });
console.log(`[reset] removed ${dataDir}`);

const result = spawnSync(process.execPath, ['--import', 'tsx', join(repoRoot, 'scripts', 'seed.ts')], {
  cwd: repoRoot,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
