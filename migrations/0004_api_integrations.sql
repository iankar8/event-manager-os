PRAGMA foreign_keys = ON;

CREATE TABLE integration_connections (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('accelevents')),
  external_event_url TEXT NOT NULL,
  external_event_id TEXT,
  session_type_format TEXT NOT NULL DEFAULT 'IN_PERSON'
    CHECK (session_type_format IN ('IN_PERSON', 'VIRTUAL', 'HYBRID')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, provider)
);

CREATE TABLE integration_runs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('accelevents')),
  source_revision_id TEXT REFERENCES schedule_revisions(id) ON DELETE SET NULL,
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('outbox', 'live')),
  status TEXT NOT NULL DEFAULT 'previewed'
    CHECK (status IN ('previewed', 'running', 'completed', 'partial', 'failed')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE integration_run_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES integration_runs(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('speaker', 'session')),
  source_id TEXT NOT NULL,
  external_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'skip', 'warning')),
  status TEXT NOT NULL DEFAULT 'previewed'
    CHECK (status IN ('previewed', 'applied', 'skipped', 'failed', 'warning')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  diff_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (run_id, record_type, source_id)
);

CREATE TABLE integration_records (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('accelevents')),
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('outbox', 'live')),
  record_type TEXT NOT NULL CHECK (record_type IN ('speaker', 'session')),
  source_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  last_run_id TEXT REFERENCES integration_runs(id) ON DELETE SET NULL,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, provider, delivery_mode, record_type, source_id)
);

CREATE INDEX idx_integration_runs_event ON integration_runs(event_id, provider, created_at DESC);
CREATE INDEX idx_integration_items_run ON integration_run_items(run_id, action, status);
CREATE INDEX idx_integration_records_source ON integration_records(event_id, provider, delivery_mode, record_type, source_id);
