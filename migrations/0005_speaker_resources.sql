PRAGMA foreign_keys = ON;

CREATE TABLE speaker_resources (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  link_url TEXT,
  link_label TEXT,
  embed_url TEXT,
  embed_title TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  scope_type TEXT NOT NULL DEFAULT 'all' CHECK (scope_type IN ('all', 'session', 'track', 'speaker')),
  scope_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((scope_type = 'all' AND scope_id IS NULL) OR (scope_type != 'all' AND scope_id IS NOT NULL))
);

CREATE TABLE speaker_resource_versions (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES speaker_resources(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  editor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (resource_id, version)
);

CREATE INDEX idx_speaker_resources_event_status
  ON speaker_resources(event_id, status, sort_order, updated_at DESC);
CREATE INDEX idx_speaker_resources_scope
  ON speaker_resources(event_id, scope_type, scope_id);
CREATE INDEX idx_speaker_resource_versions_resource
  ON speaker_resource_versions(resource_id, version DESC);
