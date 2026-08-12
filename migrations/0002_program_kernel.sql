PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  demo_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approved_domains (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, domain)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  name TEXT NOT NULL,
  title TEXT,
  company TEXT,
  bio TEXT,
  headshot_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  location TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  cfp_opens_at TEXT,
  cfp_closes_at TEXT,
  default_session_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  public_status TEXT NOT NULL DEFAULT 'private' CHECK (public_status IN ('private', 'published')),
  accent_color TEXT NOT NULL DEFAULT '#16734b',
  advisor_name TEXT NOT NULL DEFAULT 'Program Advisor',
  advisor_persona TEXT NOT NULL DEFAULT 'Experienced conference program director',
  advisor_instructions TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, slug)
);

CREATE TABLE event_members (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('organizer', 'reviewer', 'speaker')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'onboarding', 'ready', 'active', 'suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, user_id, role)
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  active_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  active_role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE magic_links (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  purpose TEXT NOT NULL CHECK (purpose IN ('sign_in', 'organizer_join', 'reviewer_join', 'speaker_portal')),
  token_hash TEXT NOT NULL UNIQUE,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  join_link_id TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#16734b',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (event_id, name)
);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (event_id, name)
);

CREATE TABLE session_formats (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (event_id, name)
);

CREATE TABLE cfp_forms (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  redirect_url TEXT,
  opens_at TEXT,
  closes_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cfp_fields (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES cfp_forms(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('short_text', 'long_text', 'number', 'select', 'multi_select', 'file')),
  help_text TEXT,
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
  options_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (form_id, field_key)
);

CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  submitter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  audience_level TEXT,
  notes_for_reviewers TEXT,
  track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  format_id TEXT REFERENCES session_formats(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'in_review', 'accepted', 'rejected', 'waitlisted', 'changes_requested')),
  submitted_at TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proposal_participants (
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_label TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (proposal_id, user_id)
);

CREATE TABLE proposal_answers (
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES cfp_fields(id) ON DELETE CASCADE,
  value_json TEXT NOT NULL,
  PRIMARY KEY (proposal_id, field_id)
);

CREATE TABLE review_plans (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'recruiting', 'active', 'closed')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE review_rounds (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES review_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  required_reviews INTEGER NOT NULL DEFAULT 1 CHECK (required_reviews BETWEEN 1 AND 5),
  blind_review INTEGER NOT NULL DEFAULT 0 CHECK (blind_review IN (0, 1)),
  instructions TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'recruiting', 'active', 'closed'))
);

CREATE TABLE join_links (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round_id TEXT REFERENCES review_rounds(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('organizer', 'reviewer')),
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  expires_at TEXT,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scorecard_criteria (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  criterion_type TEXT NOT NULL CHECK (criterion_type IN ('numeric', 'dropdown', 'long_text')),
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  weight REAL NOT NULL DEFAULT 1,
  min_value REAL,
  max_value REAL,
  options_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE reviewer_profiles (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  organization TEXT,
  topics TEXT NOT NULL DEFAULT '',
  max_capacity INTEGER NOT NULL DEFAULT 10,
  availability_note TEXT,
  conflicts_note TEXT,
  policy_accepted_at TEXT,
  status TEXT NOT NULL DEFAULT 'onboarding' CHECK (status IN ('invited', 'onboarding', 'ready', 'declined')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE reviewer_expertise (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  strength INTEGER NOT NULL DEFAULT 2 CHECK (strength BETWEEN 1 AND 3),
  PRIMARY KEY (event_id, user_id, track_id)
);

CREATE TABLE round_reviewers (
  round_id TEXT NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('invited', 'onboarding', 'ready', 'assigned', 'complete', 'declined')),
  capacity_override INTEGER,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (round_id, reviewer_id)
);

CREATE TABLE review_assignments (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'submitted', 'recused')),
  expertise_score REAL,
  assignment_reason TEXT,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE (round_id, proposal_id, reviewer_id)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL UNIQUE REFERENCES review_assignments(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  aggregate_score REAL,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE review_values (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL REFERENCES scorecard_criteria(id) ON DELETE CASCADE,
  value_json TEXT NOT NULL,
  numeric_value REAL,
  PRIMARY KEY (review_id, criterion_id)
);

CREATE TABLE research_briefs (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('queued', 'ready', 'failed')),
  summary TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (proposal_id)
);

CREATE TABLE ai_recommendations (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  round_id TEXT REFERENCES review_rounds(id) ON DELETE CASCADE,
  disposition TEXT NOT NULL CHECK (disposition IN ('advance', 'hold', 'decline')),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  reasoning TEXT NOT NULL,
  concerns TEXT NOT NULL DEFAULT '',
  score REAL,
  overridden_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  override_disposition TEXT,
  override_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  disposition TEXT NOT NULL CHECK (disposition IN ('accepted', 'rejected', 'waitlisted', 'changes_requested')),
  decided_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rationale TEXT,
  decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  proposal_id TEXT UNIQUE REFERENCES proposals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  format_id TEXT REFERENCES session_formats(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'proposal' CHECK (source_type IN ('proposal', 'direct_invitation')),
  content_status TEXT NOT NULL DEFAULT 'draft' CHECK (content_status IN ('draft', 'approved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE session_participants (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE speaker_tasks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  speaker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'submitted', 'complete')),
  deliverable_url TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE schedule_revisions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'superseded')),
  based_on_id TEXT REFERENCES schedule_revisions(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, version)
);

CREATE TABLE schedule_items (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES schedule_revisions(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  override_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (revision_id, session_id)
);

CREATE TABLE communication_templates (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  delivery_mode TEXT NOT NULL DEFAULT 'immediate' CHECK (delivery_mode IN ('immediate', 'daily_digest', 'off', 'manual')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, template_key)
);

CREATE TABLE communications (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES communication_templates(id) ON DELETE SET NULL,
  related_type TEXT NOT NULL,
  related_id TEXT,
  sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sent', 'delivered', 'failed')),
  provider_message_id TEXT,
  scheduled_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public_embeds (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  widget_type TEXT NOT NULL CHECK (widget_type IN ('sessions', 'speakers', 'agenda', 'itinerary', 'speaker_gallery')),
  output_format TEXT NOT NULL CHECK (output_format IN ('script', 'iframe', 'url', 'json', 'ical')),
  config_json TEXT NOT NULL DEFAULT '{}',
  public_token TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendee_selections (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attendee_key TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, attendee_key, session_id)
);

CREATE TABLE external_shares (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('proposal', 'session')),
  resource_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  can_comment INTEGER NOT NULL DEFAULT 0 CHECK (can_comment IN (0, 1)),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE external_comments (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL REFERENCES external_shares(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL COLLATE NOCASE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_organization ON events(organization_id);
CREATE INDEX idx_event_members_user ON event_members(user_id, event_id);
CREATE INDEX idx_auth_sessions_token ON auth_sessions(token_hash, expires_at);
CREATE INDEX idx_magic_links_token ON magic_links(token_hash, expires_at);
CREATE INDEX idx_proposals_event_status ON proposals(event_id, status, submitted_at);
CREATE INDEX idx_rounds_plan ON review_rounds(plan_id, sort_order);
CREATE INDEX idx_round_reviewers_reviewer ON round_reviewers(reviewer_id, round_id);
CREATE INDEX idx_assignments_reviewer_status ON review_assignments(reviewer_id, status);
CREATE INDEX idx_assignments_proposal ON review_assignments(proposal_id, round_id);
CREATE INDEX idx_sessions_event ON sessions(event_id);
CREATE INDEX idx_tasks_speaker_status ON speaker_tasks(speaker_id, status);
CREATE INDEX idx_schedule_revision_status ON schedule_revisions(event_id, status, version);
CREATE INDEX idx_schedule_items_time ON schedule_items(revision_id, room_id, starts_at, ends_at);
CREATE INDEX idx_communications_event_status ON communications(event_id, status, created_at);
CREATE INDEX idx_audit_event_time ON audit_events(event_id, created_at);
