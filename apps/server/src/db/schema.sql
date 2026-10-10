-- apps/server/src/db/schema.sql (owner: Dev A). JSON columns are TEXT. Times are ISO strings.
-- Contract: docs/PLAN.md section 11.15. FROZEN at CONTRACT FREEZE.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  upstream_origin TEXT NOT NULL,
  paths_json TEXT NOT NULL,
  live_release_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patches (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  author_id TEXT NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  merged_revision INTEGER,
  merge_order INTEGER,
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patch_revisions (
  patch_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (patch_id, revision)
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  patch_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS previews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  dom_hash TEXT NOT NULL,
  html TEXT NOT NULL,
  boxes_json TEXT NOT NULL,
  captured_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  patches_json TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  parent_release_id TEXT,
  origin TEXT NOT NULL,
  note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verification_run_id TEXT,
  UNIQUE (project_id, number)
);
CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  previous_release_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  health_run_id TEXT
);
CREATE TABLE IF NOT EXISTS verification_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  subject_json TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS drift_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  path TEXT NOT NULL,
  previous_snapshot_id TEXT,
  snapshot_id TEXT NOT NULL,
  results_json TEXT NOT NULL,
  quarantine_release_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  release_id TEXT,
  preview_id TEXT,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  patch_id TEXT,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
