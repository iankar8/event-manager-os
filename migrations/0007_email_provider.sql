-- Per-event email provider, bring-your-own-key.
--
-- Delivery stays outbox-only until an organizer connects their own provider in
-- Settings. The key lives in its own table rather than a column on events so
-- that every existing SELECT * on events remains incapable of leaking it.
CREATE TABLE event_email_providers (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('resend')),
  from_address TEXT NOT NULL,
  api_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
