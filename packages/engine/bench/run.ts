// packages/engine/bench/run.ts (owner: Dev B)
// Re-anchoring benchmark (PLAN 11.9, 11.14, 16). Reads fixtures/drift-benchmark/<set>/<case>/,
// compares PATCHWORK against B1 css_selector, B2 xpath and B3 best_match_no_threshold,
// writes data/bench.json (BenchRow[]) and prints a table.
//
// Usage: npm run bench -- --set dev|heldout|all   (default: dev)

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_THRESHOLDS } from '@patchwork/shared';
import type { BenchRow, ElementFingerprint, Resolution } from '@patchwork/shared';
import { captureFingerprint, resolveAnchor, resolveBestMatch, uniqueCssPath } from '../src/index.js';
import { documentFromHtml } from '../src/node.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const fixturesRoot = join(repoRoot, 'fixtures', 'drift-benchmark');
const outFile = join(repoRoot, 'data', 'bench.json');

const PAGE_URL = 'https://target.local/';
const THRESHOLDS = { ...DEFAULT_THRESHOLDS };

type SetName = 'dev' | 'heldout';

interface CaseFile {
  id: string;
  category: string;
  targetBefore: string;
  expectedAfter: string | null;
  notes: string;
}

interface Case {
  file: CaseFile;
  beforeHtml: string;
  afterHtml: string;
}

interface Outcome {
  confident: boolean;
  elementPath: string | null;
}

interface Tally {
  cases: number;
  expectedCount: number;
  reanchorHits: number;
  abstainCount: number;
  correctAbstain: number;
  wrong: number;
}

type Method = BenchRow['method'];

function loadSet(set: SetName): Case[] {
  const dir = join(fixturesRoot, set);
  if (!existsSync(dir)) return [];
  const cases: Case[] = [];
  for (const entry of readdirSync(dir)) {
    const caseDir = join(dir, entry);
    const casePath = join(caseDir, 'case.json');
    if (!existsSync(casePath)) continue;
    const file = JSON.parse(readFileSync(casePath, 'utf8')) as CaseFile;
    const before = readFileSync(join(caseDir, 'before.html'), 'utf8');
    const after = readFileSync(join(caseDir, 'after.html'), 'utf8');
    cases.push({ file, beforeHtml: before, afterHtml: after });
  }
  cases.sort((a, b) => a.file.id.localeCompare(b.file.id));
  return cases;
}

function confidentFromResolution(res: Resolution): Outcome {
  const confident = res.status === 'exact' || res.status === 'relocated';
  return { confident, elementPath: confident ? res.elementPath : null };
}

function evaluate(method: Method, fp: ElementFingerprint, c: Case): Outcome {
  const { document: after } = documentFromHtml(c.afterHtml, PAGE_URL);

  switch (method) {
    case 'css_selector': {
      if (!fp.cssPath) return { confident: false, elementPath: null };
      let matches: Element[] = [];
      try {
        matches = Array.from(after.querySelectorAll(fp.cssPath)) as Element[];
      } catch {
        return { confident: false, elementPath: null };
      }
      return matches.length === 1
        ? { confident: true, elementPath: uniqueCssPath(matches[0] as Element) }
        : { confident: false, elementPath: null };
    }
    case 'xpath': {
      if (!fp.xpath) return { confident: false, elementPath: null };
      try {
        const snapshot = after.evaluate(fp.xpath, after, null, 7, null) as {
          snapshotLength: number;
          snapshotItem: (i: number) => Node | null;
        };
        if (snapshot.snapshotLength !== 1) return { confident: false, elementPath: null };
        const node = snapshot.snapshotItem(0);
        if (!node || node.nodeType !== 1) return { confident: false, elementPath: null };
        return { confident: true, elementPath: uniqueCssPath(node as Element) };
      } catch {
        return { confident: false, elementPath: null };
      }
    }
    case 'best_match_no_threshold':
      return confidentFromResolution(resolveBestMatch(after, 'anchor', fp));
    case 'patchwork':
      return confidentFromResolution(
        resolveAnchor(after, 'anchor', fp, { mode: 'smart', thresholds: THRESHOLDS }),
      );
    case 'patchwork_llm':
      // Not run: no model is called in this build, so a row would only repeat `patchwork`.
      throw new Error('patchwork_llm is not benchmarked (no assist provider is wired up)');
  }
}

function tallyMethod(method: Method, cases: Case[]): Tally {
  const t: Tally = {
    cases: cases.length,
    expectedCount: 0,
    reanchorHits: 0,
    abstainCount: 0,
    correctAbstain: 0,
    wrong: 0,
  };

  for (const c of cases) {
    const { document: before } = documentFromHtml(c.beforeHtml, PAGE_URL);
    const target = before.querySelector(c.file.targetBefore);
    if (!target) throw new Error(`${c.file.id}: targetBefore '${c.file.targetBefore}' not found in before.html`);
    const fp = captureFingerprint(target);

    const { document: after } = documentFromHtml(c.afterHtml, PAGE_URL);
    const expectedEl = c.file.expectedAfter ? after.querySelector(c.file.expectedAfter) : null;
    const expectedPath = expectedEl ? uniqueCssPath(expectedEl) : null;
    const hasExpected = c.file.expectedAfter !== null;

    const outcome = evaluate(method, fp, c);

    if (hasExpected) {
      t.expectedCount += 1;
      if (outcome.confident && outcome.elementPath === expectedPath) t.reanchorHits += 1;
      else if (outcome.confident) t.wrong += 1;
    } else {
      t.abstainCount += 1;
      if (!outcome.confident) t.correctAbstain += 1;
      else t.wrong += 1;
    }
  }

  return t;
}

function toRow(method: Method, set: SetName, t: Tally): BenchRow {
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  return {
    method,
    set,
    cases: t.cases,
    reanchorRate: t.expectedCount > 0 ? round(t.reanchorHits / t.expectedCount) : 0,
    wrongTargetRate: t.cases > 0 ? round(t.wrong / t.cases) : 0,
    correctAbstainRate: t.abstainCount > 0 ? round(t.correctAbstain / t.abstainCount) : 0,
  };
}

const METHODS: Method[] = [
  'patchwork',
  'css_selector',
  'xpath',
  'best_match_no_threshold',
];

function parseArgs(argv: string[]): { set: 'dev' | 'heldout' | 'all' } {
  const idx = argv.indexOf('--set');
  const value = idx >= 0 ? argv[idx + 1] : 'dev';
  if (value === 'dev' || value === 'heldout' || value === 'all') return { set: value };
  throw new Error(`unknown --set '${value}' (expected dev|heldout|all)`);
}

function main(): void {
  const { set } = parseArgs(process.argv.slice(2));
  const sets: SetName[] = set === 'all' ? ['dev', 'heldout'] : [set];

  const rows: BenchRow[] = [];
  for (const s of sets) {
    const cases = loadSet(s);
    if (cases.length === 0) {
      if (set === 'heldout') throw new Error(`no cases found in ${join(fixturesRoot, s)}`);
      continue;
    }
    for (const method of METHODS) rows.push(toRow(method, s, tallyMethod(method, cases)));
  }

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(rows, null, 2)}\n`);

  const pad = (v: string | number, w: number): string => String(v).padEnd(w);
  console.log(`\nPATCHWORK re-anchor benchmark (set=${set}) -> ${outFile}\n`);
  console.log(
    pad('method', 26) + pad('set', 9) + pad('cases', 7) + pad('reanchor', 10) + pad('wrongTgt', 10) + 'abstain',
  );
  console.log('-'.repeat(72));
  for (const r of rows) {
    console.log(
      pad(r.method, 26) +
        pad(r.set, 9) +
        pad(r.cases, 7) +
        pad(r.reanchorRate, 10) +
        pad(r.wrongTargetRate, 10) +
        r.correctAbstainRate,
    );
  }
  console.log('');
}

main();
