PRAGMA foreign_keys = ON;

ALTER TABLE cfp_fields ADD COLUMN condition_field_key TEXT;
ALTER TABLE cfp_fields ADD COLUMN condition_value TEXT;

ALTER TABLE proposals ADD COLUMN key_takeaway TEXT;
ALTER TABLE proposals ADD COLUMN workshop_prerequisites TEXT;

ALTER TABLE users ADD COLUMN twitter TEXT;
ALTER TABLE users ADD COLUMN linkedin_url TEXT;
ALTER TABLE users ADD COLUMN dietary_preferences TEXT;
ALTER TABLE users ADD COLUMN tshirt_size TEXT;
ALTER TABLE users ADD COLUMN travel_preferences TEXT;
ALTER TABLE users ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN organizer_note TEXT;

ALTER TABLE speaker_tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'action';
ALTER TABLE speaker_tasks ADD COLUMN accepted_types TEXT;
ALTER TABLE speaker_tasks ADD COLUMN max_file_bytes INTEGER;

CREATE TABLE deliverable_files (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES speaker_tasks(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  speaker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  version INTEGER NOT NULL,
  is_latest INTEGER NOT NULL DEFAULT 1 CHECK (is_latest IN (0, 1)),
  data BLOB,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (task_id, version)
);

CREATE TABLE deliverable_comments (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES deliverable_files(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE content_versions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('session', 'speaker')),
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  editor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  change_summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (entity_type, entity_id, version)
);

CREATE INDEX idx_deliverables_task_version ON deliverable_files(task_id, version DESC);
CREATE INDEX idx_deliverable_comments_file ON deliverable_comments(file_id, created_at);
CREATE INDEX idx_content_versions_entity ON content_versions(entity_type, entity_id, version DESC);

UPDATE session_formats SET name = 'Keynote (45 min)' WHERE name = 'Keynote';
UPDATE session_formats SET name = 'Talk (30 min)' WHERE name = 'Talk';
UPDATE session_formats SET name = 'Lightning Talk (10 min)' WHERE name = 'Lightning Talk';
UPDATE session_formats SET name = 'Workshop (120 min)' WHERE name = 'Workshop';
UPDATE session_formats SET name = 'Panel (45 min)' WHERE name = 'Panel';

INSERT OR IGNORE INTO cfp_fields (id, form_id, field_key, label, field_type, required, sort_order)
SELECT 'fld_' || lower(hex(randomblob(12))), id, 'track', 'Track', 'select', 1, 3 FROM cfp_forms;

INSERT OR IGNORE INTO cfp_fields (id, form_id, field_key, label, field_type, required, sort_order)
SELECT 'fld_' || lower(hex(randomblob(12))), id, 'format', 'Session format', 'select', 1, 4 FROM cfp_forms;

UPDATE cfp_fields SET sort_order = 5 WHERE field_key = 'audience';

INSERT OR IGNORE INTO cfp_fields (id, form_id, field_key, label, field_type, required, sort_order)
SELECT 'fld_' || lower(hex(randomblob(12))), id, 'speaker_bio', 'Speaker bio', 'long_text', 1, 6 FROM cfp_forms;

INSERT OR IGNORE INTO cfp_fields (id, form_id, field_key, label, field_type, required, help_text, sort_order)
SELECT 'fld_' || lower(hex(randomblob(12))), id, 'key_takeaway', 'Key takeaway', 'short_text', 1,
  'The concrete idea attendees should remember.', 7 FROM cfp_forms;

INSERT OR IGNORE INTO cfp_fields
  (id, form_id, field_key, label, field_type, required, help_text, sort_order, condition_field_key, condition_value)
SELECT 'fld_' || lower(hex(randomblob(12))), id, 'workshop_prerequisites', 'Workshop prerequisites', 'long_text', 0,
  'Shown only for the workshop format.', 8, 'format', 'Workshop (120 min)' FROM cfp_forms;

UPDATE users
SET twitter = '@priyabuilds',
    linkedin_url = 'https://www.linkedin.com/in/priya-raman-example',
    dietary_preferences = 'Vegetarian',
    tshirt_size = 'M',
    travel_preferences = 'Window seat; arrive one day before the event'
WHERE email LIKE 'sbek-speaker%@example.com' AND name = 'Priya Raman';

UPDATE speaker_tasks
SET task_type = 'file_request', accepted_types = '.pdf,.ppt,.pptx', max_file_bytes = 26214400
WHERE title = 'Upload final slides';
