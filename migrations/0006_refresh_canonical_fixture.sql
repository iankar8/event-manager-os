-- Refresh the canonical evaluation workspace.
--
-- ensureCanonicalWorkspace() only seeds when the 'devflow-evaluation' organization
-- is absent, so a database created before the lifecycle fixture existed keeps the
-- older data forever — including the evaluation workspace that seeded credentials
-- sign in to. Dropping it here lets the next sign-in rebuild it from the current
-- seed, with a submitted review, a content version, and an explicit chronology.
--
-- This only removes the deterministic demonstration fixture. Isolated /demo
-- workspaces use suffixed slugs and e-mail addresses and are untouched.

-- Cascades through events, proposals, reviews, sessions, schedules, and members.
DELETE FROM organizations WHERE slug = 'devflow-evaluation';

-- The fixture users are global rows, so they outlive the cascade and would
-- collide with the re-seed on users.email (UNIQUE). They are only ever members of
-- the canonical organization, and every RESTRICT reference to them was owned by
-- the organization deleted above.
DELETE FROM users WHERE email IN (
  'sbek-organizer@example.com',
  'sbek-reviewer@example.com',
  'sbek-speaker@example.com',
  'sbek-speaker2@example.com'
);
