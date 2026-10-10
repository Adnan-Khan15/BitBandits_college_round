// apps/server/src/env.ts (owner: Dev A)
// Loads .env (if present) and applies the defaults from .env.example (PLAN section 11.16).
// Precedence: process.env > .env file > default. None is secret except OPENROUTER_API_KEY.

export interface Env {
  PW_CONTROL_PORT: number;
  PW_LIVE_PORT: number;
  PW_PREVIEW_PORT: number;
  PW_TARGET_PORT: number;
  PW_PROJECT_ID: string;
  PW_ALLOWED_UPSTREAMS: string[];
  PW_EDITOR_ORIGIN: string;
  PW_PREVIEW_ORIGIN: string;
  PW_DB_PATH: string;
  PW_ARTIFACTS_DIR: string;
  PW_DRIFT_POLL_SECONDS: number;
  PW_HEALTH_WINDOW_SECONDS: number;
  PW_SLICE_MODE: number;
  PW_ASSIST_PROVIDER: 'none' | 'ollama' | 'openrouter';
  PW_ASSIST_MODEL: string;
  PW_OLLAMA_URL: string;
  PW_ASSIST_TIMEOUT_MS: number;
  OPENROUTER_API_KEY: string;
}

const DEFAULTS: Record<keyof Env, string> = {
  PW_CONTROL_PORT: '4000',
  PW_LIVE_PORT: '4100',
  PW_TARGET_PORT: '4200',
  PW_PREVIEW_PORT: '4300',
  PW_PROJECT_ID: 'prj_shoplite',
  PW_ALLOWED_UPSTREAMS: 'http://localhost:4200',
  PW_EDITOR_ORIGIN: 'http://localhost:5173',
  PW_PREVIEW_ORIGIN: 'http://localhost:4300',
  PW_DB_PATH: './data/patchwork.db',
  PW_ARTIFACTS_DIR: './data/artifacts',
  PW_DRIFT_POLL_SECONDS: '60',
  PW_HEALTH_WINDOW_SECONDS: '30',
  PW_SLICE_MODE: '0',
  PW_ASSIST_PROVIDER: 'none',
  PW_ASSIST_MODEL: 'qwen3:4b',
  PW_OLLAMA_URL: 'http://localhost:11434',
  PW_ASSIST_TIMEOUT_MS: '20000',
  OPENROUTER_API_KEY: '',
};

/** Parse a dotenv-style file: KEY=value, # comments, blank lines. No interpolation. */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnv(
  overrides: Record<string, string | undefined> = process.env,
  dotenv: Record<string, string> = {},
): Env {
  const pick = (key: keyof Env): string => {
    const fromProcess = overrides[key];
    if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
    const fromFile = dotenv[key];
    if (fromFile !== undefined && fromFile !== '') return fromFile;
    return DEFAULTS[key];
  };
  const num = (key: keyof Env): number => Number.parseInt(pick(key), 10);
  const assist = pick('PW_ASSIST_PROVIDER');
  if (assist !== 'none' && assist !== 'ollama' && assist !== 'openrouter') {
    throw new Error(`PW_ASSIST_PROVIDER must be none | ollama | openrouter, got "${assist}"`);
  }
  return {
    PW_CONTROL_PORT: num('PW_CONTROL_PORT'),
    PW_LIVE_PORT: num('PW_LIVE_PORT'),
    PW_TARGET_PORT: num('PW_TARGET_PORT'),
    PW_PREVIEW_PORT: num('PW_PREVIEW_PORT'),
    PW_PROJECT_ID: pick('PW_PROJECT_ID'),
    PW_ALLOWED_UPSTREAMS: pick('PW_ALLOWED_UPSTREAMS')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    PW_EDITOR_ORIGIN: pick('PW_EDITOR_ORIGIN'),
    PW_PREVIEW_ORIGIN: pick('PW_PREVIEW_ORIGIN'),
    PW_DB_PATH: pick('PW_DB_PATH'),
    PW_ARTIFACTS_DIR: pick('PW_ARTIFACTS_DIR'),
    PW_DRIFT_POLL_SECONDS: num('PW_DRIFT_POLL_SECONDS'),
    PW_HEALTH_WINDOW_SECONDS: num('PW_HEALTH_WINDOW_SECONDS'),
    PW_SLICE_MODE: num('PW_SLICE_MODE'),
    PW_ASSIST_PROVIDER: assist,
    PW_ASSIST_MODEL: pick('PW_ASSIST_MODEL'),
    PW_OLLAMA_URL: pick('PW_OLLAMA_URL'),
    PW_ASSIST_TIMEOUT_MS: num('PW_ASSIST_TIMEOUT_MS'),
    OPENROUTER_API_KEY: pick('OPENROUTER_API_KEY'),
  };
}

/** Read .env from disk if present (repo root), then load. Used by main.ts. */
export async function loadEnvFromDisk(
  envPath: string = new URL('../../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
): Promise<Env> {
  let dotenv: Record<string, string> = {};
  try {
    const { readFileSync } = await import('node:fs');
    dotenv = parseDotEnv(readFileSync(envPath, 'utf8'));
  } catch {
    dotenv = {}; // no .env file: defaults are fine (PLAN section 17)
  }
  return loadEnv(process.env, dotenv);
}
