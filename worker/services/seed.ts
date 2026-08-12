import { createId, hashPassword } from "../lib/crypto";

export type SeededWorkspace = {
  organizationId: string;
  eventId: string;
  users: {
    organizer: string;
    reviewer: string;
    speaker: string;
    speaker2: string;
  };
};

const fixturePasswords = {
  organizer: "SbekTest!2027-org",
  reviewer: "SbekTest!2027-rev",
  speaker: "SbekTest!2027-spk",
  speaker2: "SbekTest!2027-spk2",
};

export async function seedProgramWorkspace(
  db: D1Database,
  options: { demoKey?: string; canonical?: boolean } = {},
): Promise<SeededWorkspace> {
  const suffix = options.canonical ? "" : `+${options.demoKey ?? crypto.randomUUID().slice(0, 8)}`;
  const id = (prefix: string) => createId(prefix);
  const organizationId = id("org");
  const eventId = id("evt");
  const organizerId = id("usr");
  const reviewerId = id("usr");
  const speakerId = id("usr");
  const speaker2Id = id("usr");
  const trackAi = id("trk");
  const trackPlatform = id("trk");
  const trackDx = id("trk");
  const roomMain = id("rom");
  const room2a = id("rom");
  const room2b = id("rom");
  const roomLab = id("rom");
  const formatKeynote = id("fmt");
  const formatTalk = id("fmt");
  const formatLightning = id("fmt");
  const formatWorkshop = id("fmt");
  const formatPanel = id("fmt");
  const formId = id("cfp");
  const proposalCi = id("pro");
  const proposalAi = id("pro");
  const proposalDocs = id("pro");
  const planId = id("pln");
  const roundInitial = id("rnd");
  const roundFinal = id("rnd");
  const criterionOriginality = id("crt");
  const criterionRelevance = id("crt");
  const criterionRecommendation = id("crt");
  const criterionComments = id("crt");
  const assignmentCi = id("asn");
  const sessionAi = id("ssn");
  const handbookResource = id("rsc");
  const rehearsalResource = id("rsc");
  const arrivalResource = id("rsc");
  const publishedRevision = id("rev");
  const draftRevision = id("rev");
  const organizationSlug = options.canonical ? "devflow-evaluation" : `devflow-demo-${options.demoKey}`;
  const eventSlug = options.canonical ? "devflow-conf-2027" : `devflow-conf-2027-${options.demoKey}`;
  const email = (local: string) => `${local}${suffix}@example.com`;

  const passwordHashes = await Promise.all([
    hashPassword(fixturePasswords.organizer),
    hashPassword(fixturePasswords.reviewer),
    hashPassword(fixturePasswords.speaker),
    hashPassword(fixturePasswords.speaker2),
  ]);

  const statements: D1PreparedStatement[] = [
    db.prepare("INSERT INTO organizations (id, name, slug, is_demo, demo_key) VALUES (?, ?, ?, ?, ?)")
      .bind(organizationId, "DevFlow Collaborative", organizationSlug, options.canonical ? 0 : 1, options.demoKey ?? null),
    db.prepare("INSERT INTO approved_domains (id, organization_id, domain) VALUES (?, ?, ?)")
      .bind(id("dom"), organizationId, "latticework.com"),
    db.prepare("INSERT INTO approved_domains (id, organization_id, domain) VALUES (?, ?, ?)")
      .bind(id("dom"), organizationId, "cloudreach.com"),
    db.prepare("INSERT INTO users (id, email, password_hash, name, title, company, bio) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(organizerId, email("sbek-organizer"), passwordHashes[0], "Jordan Alvarez", "Director of Programs", "DevFlow Collaborative", "Leads program operations for DevFlow Conf."),
    db.prepare("INSERT INTO users (id, email, password_hash, name, title, company, bio) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(reviewerId, email("sbek-reviewer"), passwordHashes[1], "Sam Whitfield", "Staff Engineer", "Northstar Cloud", "Program committee reviewer focused on platform systems and AI engineering."),
    db.prepare("INSERT INTO users (id, email, password_hash, name, title, company, bio, twitter, linkedin_url, dietary_preferences, tshirt_size, travel_preferences) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(speakerId, email("sbek-speaker"), passwordHashes[2], "Priya Raman", "Principal Engineer", "Latticework Systems", "Priya Raman is a Principal Engineer at Latticework Systems where she leads the build-tooling platform team. She previously maintained the open-source task runner 'gantry' and has spoken at over a dozen developer conferences on build systems, CI reliability, and developer productivity metrics.", "@priyabuilds", "https://www.linkedin.com/in/priya-raman-example", "Vegetarian", "M", "Window seat; arrive one day before the event"),
    db.prepare("INSERT INTO users (id, email, password_hash, name, title, company, bio) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(speaker2Id, email("sbek-speaker2"), passwordHashes[3], "Marcus Okafor", "Staff Developer Advocate", "Cloudreach Labs", "Marcus focuses on AI agents in production and co-organizes the SF AI Tinkerers meetup."),
    db.prepare("INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, 'owner')")
      .bind(organizationId, organizerId),
    db.prepare(`INSERT INTO events
      (id, organization_id, name, slug, tagline, description, location, timezone, starts_on, ends_on,
       cfp_opens_at, cfp_closes_at, status, public_status, advisor_persona, advisor_instructions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'published', ?, ?)`).bind(
      eventId,
      organizationId,
      "DevFlow Conf 2027",
      eventSlug,
      "The developer workflow conference",
      "A three-day, three-track conference on developer tooling, AI-assisted engineering, and platform infrastructure.",
      "Moscone West, San Francisco, CA",
      "America/Los_Angeles",
      "2027-05-12",
      "2027-05-14",
      "2026-08-01T09:00:00-07:00",
      "2027-04-30T23:59:00-07:00",
      "Experienced technical conference curator",
      "Prioritize practical evidence, audience value, subject-matter breadth, and a coherent program. Cite sources and keep AI judgment distinct from human review.",
    ),
    db.prepare("INSERT INTO event_members (event_id, user_id, role, status) VALUES (?, ?, 'organizer', 'active')").bind(eventId, organizerId),
    db.prepare("INSERT INTO event_members (event_id, user_id, role, status) VALUES (?, ?, 'reviewer', 'ready')").bind(eventId, reviewerId),
    db.prepare("INSERT INTO event_members (event_id, user_id, role, status) VALUES (?, ?, 'speaker', 'active')").bind(eventId, speakerId),
    db.prepare("INSERT INTO event_members (event_id, user_id, role, status) VALUES (?, ?, 'speaker', 'active')").bind(eventId, speaker2Id),
    db.prepare("INSERT INTO tracks (id, event_id, name, color, sort_order) VALUES (?, ?, 'AI Engineering', '#7a5af8', 1)").bind(trackAi, eventId),
    db.prepare("INSERT INTO tracks (id, event_id, name, color, sort_order) VALUES (?, ?, 'Platform & Infra', '#16734b', 2)").bind(trackPlatform, eventId),
    db.prepare("INSERT INTO tracks (id, event_id, name, color, sort_order) VALUES (?, ?, 'Developer Experience', '#ad5f00', 3)").bind(trackDx, eventId),
    db.prepare("INSERT INTO rooms (id, event_id, name, capacity, sort_order) VALUES (?, ?, 'Main Stage', 900, 1)").bind(roomMain, eventId),
    db.prepare("INSERT INTO rooms (id, event_id, name, capacity, sort_order) VALUES (?, ?, 'Room 2A', 280, 2)").bind(room2a, eventId),
    db.prepare("INSERT INTO rooms (id, event_id, name, capacity, sort_order) VALUES (?, ?, 'Room 2B', 220, 3)").bind(room2b, eventId),
    db.prepare("INSERT INTO rooms (id, event_id, name, capacity, sort_order) VALUES (?, ?, 'Workshop Lab', 90, 4)").bind(roomLab, eventId),
    db.prepare("INSERT INTO session_formats (id, event_id, name, duration_minutes, sort_order) VALUES (?, ?, 'Keynote (45 min)', 45, 1)").bind(formatKeynote, eventId),
    db.prepare("INSERT INTO session_formats (id, event_id, name, duration_minutes, sort_order) VALUES (?, ?, 'Talk (30 min)', 30, 2)").bind(formatTalk, eventId),
    db.prepare("INSERT INTO session_formats (id, event_id, name, duration_minutes, sort_order) VALUES (?, ?, 'Lightning Talk (10 min)', 10, 3)").bind(formatLightning, eventId),
    db.prepare("INSERT INTO session_formats (id, event_id, name, duration_minutes, sort_order) VALUES (?, ?, 'Workshop (120 min)', 120, 4)").bind(formatWorkshop, eventId),
    db.prepare("INSERT INTO session_formats (id, event_id, name, duration_minutes, sort_order) VALUES (?, ?, 'Panel (45 min)', 45, 5)").bind(formatPanel, eventId),
    db.prepare("INSERT INTO cfp_forms (id, event_id, name, status, redirect_url, opens_at, closes_at) VALUES (?, ?, 'Call for Speakers', 'published', '/portal/submissions', ?, ?)")
      .bind(formId, eventId, "2026-08-01T09:00:00-07:00", "2027-04-30T23:59:00-07:00"),
    db.prepare("INSERT INTO cfp_fields (id, form_id, field_key, label, field_type, required, sort_order) VALUES (?, ?, 'title', 'Session title', 'short_text', 1, 1)").bind(id("fld"), formId),
    db.prepare("INSERT INTO cfp_fields (id, form_id, field_key, label, field_type, required, sort_order) VALUES (?, ?, 'abstract', 'Abstract', 'long_text', 1, 2)").bind(id("fld"), formId),
    db.prepare("INSERT INTO cfp_fields (id, form_id, field_key, label, field_type, required, options_json, sort_order) VALUES (?, ?, 'audience', 'Audience level', 'select', 1, ?, 3)")
      .bind(id("fld"), formId, JSON.stringify(["Beginner", "Intermediate", "Advanced"])),
    db.prepare("INSERT INTO cfp_fields (id, form_id, field_key, label, field_type, required, sort_order) VALUES (?, ?, 'track', 'Track', 'select', 1, 4)").bind(id("fld"), formId),
    db.prepare("INSERT INTO cfp_fields (id, form_id, field_key, label, field_type, required, sort_order) VALUES (?, ?, 'format', 'Session format', 'select', 1, 5)").bind(id("fld"), formId),
    db.prepare("INSERT INTO cfp_fields (id, form_id, field_key, label, field_type, required, sort_order) VALUES (?, ?, 'speaker_bio', 'Speaker bio', 'long_text', 1, 6)").bind(id("fld"), formId),
    db.prepare("INSERT INTO cfp_fields (id, form_id, field_key, label, field_type, help_text, required, sort_order) VALUES (?, ?, 'key_takeaway', 'Key takeaway', 'short_text', 'The concrete idea attendees should remember.', 1, 7)").bind(id("fld"), formId),
    db.prepare("INSERT INTO cfp_fields (id, form_id, field_key, label, field_type, help_text, required, sort_order, condition_field_key, condition_value) VALUES (?, ?, 'workshop_prerequisites', 'Workshop prerequisites', 'long_text', 'Shown only for the workshop format.', 0, 8, 'format', 'Workshop (120 min)')").bind(id("fld"), formId),
    db.prepare(`INSERT INTO proposals
      (id, event_id, submitter_id, title, abstract, audience_level, notes_for_reviewers, track_id, format_id, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, 'Intermediate', ?, ?, ?, 'in_review', CURRENT_TIMESTAMP)`).bind(
      proposalCi,
      eventId,
      speakerId,
      "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
      "Our monorepo CI took 40 minutes on a good day. This talk walks through how we cut it to 6 minutes with content-addressed caching, remote execution, and a test-selection model—including the two migrations that failed first.",
      "Previously presented a 10-minute version at PlatformCon; this is the expanded version with new data.",
      trackPlatform,
      formatTalk,
    ),
    db.prepare(`INSERT INTO proposals
      (id, event_id, submitter_id, title, abstract, audience_level, notes_for_reviewers, track_id, format_id, status, submitted_at, decided_at)
      VALUES (?, ?, ?, ?, ?, 'Advanced', ?, ?, ?, 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).bind(
      proposalAi,
      eventId,
      speakerId,
      "Your AI Pair Programmer Is Lying to You: Verification Patterns That Scale",
      "Code generation is easy; trusting it is hard. This session covers property tests, mutation coverage, snapshot judges, and CI gates with data from a 200-engineer codebase.",
      "Can also be delivered as a hands-on workshop.",
      trackAi,
      formatTalk,
    ),
    db.prepare(`INSERT INTO proposals
      (id, event_id, submitter_id, title, abstract, audience_level, track_id, format_id, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, 'Beginner', ?, ?, 'submitted', CURRENT_TIMESTAMP)`).bind(
      proposalDocs,
      eventId,
      speaker2Id,
      "Docs That Answer Back: Retrieval-Grounded Documentation Sites",
      "A practical tour of turning a static docs site into one that answers questions with citations, stays honest when it does not know, and costs under $50 per month.",
      trackDx,
      formatLightning,
    ),
    db.prepare("INSERT INTO proposal_participants (proposal_id, user_id, role_label, is_primary, sort_order) VALUES (?, ?, 'Primary speaker', 1, 1)").bind(proposalCi, speakerId),
    db.prepare("INSERT INTO proposal_participants (proposal_id, user_id, role_label, is_primary, sort_order) VALUES (?, ?, 'Co-speaker', 0, 2)").bind(proposalCi, speaker2Id),
    db.prepare("INSERT INTO proposal_participants (proposal_id, user_id, role_label, is_primary, sort_order) VALUES (?, ?, 'Primary speaker', 1, 1)").bind(proposalAi, speakerId),
    db.prepare("INSERT INTO proposal_participants (proposal_id, user_id, role_label, is_primary, sort_order) VALUES (?, ?, 'Primary speaker', 1, 1)").bind(proposalDocs, speaker2Id),
    db.prepare("INSERT INTO review_plans (id, event_id, name, status, created_by) VALUES (?, ?, '2027 Program Selection', 'active', ?)").bind(planId, eventId, organizerId),
    db.prepare("INSERT INTO review_rounds (id, plan_id, name, opens_at, closes_at, required_reviews, blind_review, instructions, sort_order, status) VALUES (?, ?, 'Initial Review', '2026-08-01', '2026-10-15', 1, 0, 'Score content quality and audience value. Keep research distinct from submitted information.', 1, 'active')").bind(roundInitial, planId),
    db.prepare("INSERT INTO review_rounds (id, plan_id, name, opens_at, closes_at, required_reviews, blind_review, instructions, sort_order, status) VALUES (?, ?, 'Final Review', '2026-10-16', '2026-11-30', 2, 1, 'Select the final slate and resolve reviewer disagreement.', 2, 'draft')").bind(roundFinal, planId),
    db.prepare("INSERT INTO scorecard_criteria (id, round_id, label, criterion_type, weight, min_value, max_value, sort_order) VALUES (?, ?, 'Originality', 'numeric', 2, 1, 5, 1)").bind(criterionOriginality, roundInitial),
    db.prepare("INSERT INTO scorecard_criteria (id, round_id, label, criterion_type, weight, min_value, max_value, sort_order) VALUES (?, ?, 'Relevance', 'numeric', 1, 1, 5, 2)").bind(criterionRelevance, roundInitial),
    db.prepare("INSERT INTO scorecard_criteria (id, round_id, label, criterion_type, options_json, sort_order) VALUES (?, ?, 'Recommendation', 'dropdown', ?, 3)").bind(criterionRecommendation, roundInitial, JSON.stringify(["Accept", "Maybe", "Reject"])),
    db.prepare("INSERT INTO scorecard_criteria (id, round_id, label, criterion_type, sort_order) VALUES (?, ?, 'Comments', 'long_text', 4)").bind(criterionComments, roundInitial),
    db.prepare("INSERT INTO reviewer_profiles (event_id, user_id, title, organization, topics, max_capacity, availability_note, policy_accepted_at, status) VALUES (?, ?, 'Staff Engineer', 'Northstar Cloud', 'CI systems, platform engineering, AI verification', 8, 'Available through October 15', CURRENT_TIMESTAMP, 'ready')").bind(eventId, reviewerId),
    db.prepare("INSERT INTO reviewer_expertise (event_id, user_id, track_id, strength) VALUES (?, ?, ?, 3)").bind(eventId, reviewerId, trackPlatform),
    db.prepare("INSERT INTO reviewer_expertise (event_id, user_id, track_id, strength) VALUES (?, ?, ?, 2)").bind(eventId, reviewerId, trackAi),
    db.prepare("INSERT INTO round_reviewers (round_id, reviewer_id, status) VALUES (?, ?, 'assigned')").bind(roundInitial, reviewerId),
    db.prepare("INSERT INTO review_assignments (id, round_id, proposal_id, reviewer_id, status, expertise_score, assignment_reason) VALUES (?, ?, ?, ?, 'assigned', 0.96, 'Strong Platform & Infra expertise; 1 of 8 capacity used.')").bind(assignmentCi, roundInitial, proposalCi, reviewerId),
    db.prepare("INSERT INTO research_briefs (id, proposal_id, summary, sources_json, warnings_json) VALUES (?, ?, ?, ?, '[]')").bind(
      id("rsh"),
      proposalCi,
      "Priya leads build tooling at Latticework Systems and has prior public work on CI reliability. Marcus brings production AI-agent experience. Their cited materials support the proposal's practical focus.",
      JSON.stringify([
        { title: "Latticework Engineering: Build performance", url: "https://example.com/latticework-build", retrievedAt: "2026-08-11" },
        { title: "PlatformCon speaker archive", url: "https://example.com/platformcon-priya", retrievedAt: "2026-08-11" },
      ]),
    ),
    db.prepare("INSERT INTO ai_recommendations (id, proposal_id, round_id, disposition, confidence, reasoning, concerns, score) VALUES (?, ?, ?, 'advance', 0.86, ?, ?, 4.5)").bind(
      id("air"),
      proposalCi,
      roundInitial,
      "Strong audience fit, specific evidence, and a useful decision framework distinguish this proposal from generic CI talks.",
      "The abstract should name the tooling used and clarify what is new beyond the earlier short version.",
    ),
    db.prepare("INSERT INTO decisions (id, proposal_id, disposition, decided_by, rationale) VALUES (?, ?, 'accepted', ?, 'Strong evidence and direct fit for the AI Engineering track.')").bind(id("dec"), proposalAi, organizerId),
    db.prepare("INSERT INTO sessions (id, event_id, proposal_id, title, description, track_id, format_id, source_type, content_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'proposal', 'approved')").bind(
      sessionAi,
      eventId,
      proposalAi,
      "Your AI Pair Programmer Is Lying to You: Verification Patterns That Scale",
      "Code generation is easy; trusting it is hard. Learn practical verification patterns backed by production experience.",
      trackAi,
      formatTalk,
    ),
    db.prepare("INSERT INTO session_participants (session_id, user_id, role_label, sort_order) VALUES (?, ?, 'Speaker', 1)").bind(sessionAi, speakerId),
    db.prepare(`INSERT INTO speaker_resources
      (id, event_id, title, summary, body, link_url, link_label, status, scope_type, sort_order, author_id)
      VALUES (?, ?, 'DevFlow speaker handbook', 'Arrival, production, and presentation guidance for every DevFlow speaker.',
        'Check in at the speaker desk on Level 2 at least 30 minutes before your first session. Bring a local copy of your deck and a USB-C adapter.',
        'https://example.com/devflow-speaker-production-guide', 'Open production guide', 'published', 'all', 10, ?)`)
      .bind(handbookResource, eventId, organizerId),
    db.prepare(`INSERT INTO speaker_resources
      (id, event_id, title, summary, body, embed_url, embed_title, status, scope_type, scope_id, sort_order, author_id)
      VALUES (?, ?, 'AI track rehearsal notes', 'Session-specific stage, timing, and recording guidance for the AI Engineering track.',
        'Join the AV check fifteen minutes early. The confidence monitor shows slides only; speaker notes remain on your laptop.',
        'https://www.youtube.com/embed/M7lc1UVf-VE', 'AV rehearsal example', 'published', 'session', ?, 20, ?)`)
      .bind(rehearsalResource, eventId, sessionAi, organizerId),
    db.prepare(`INSERT INTO speaker_resources
      (id, event_id, title, summary, body, status, scope_type, scope_id, sort_order, author_id)
      VALUES (?, ?, 'Main Stage arrival guide', 'Draft routing notes for the Main Stage green room.',
        'Use the west service elevator and check in with the stage manager before entering the green room.',
        'draft', 'session', ?, 30, ?)`)
      .bind(arrivalResource, eventId, sessionAi, organizerId),
    db.prepare("INSERT INTO speaker_tasks (id, event_id, session_id, speaker_id, title, due_at, status) VALUES (?, ?, ?, ?, 'Confirm participation', '2027-04-01', 'complete')").bind(id("tsk"), eventId, sessionAi, speakerId),
    db.prepare("INSERT INTO speaker_tasks (id, event_id, session_id, speaker_id, title, due_at, status) VALUES (?, ?, ?, ?, 'Upload headshot', '2027-04-01', 'complete')").bind(id("tsk"), eventId, sessionAi, speakerId),
    db.prepare("INSERT INTO speaker_tasks (id, event_id, session_id, speaker_id, title, due_at, status) VALUES (?, ?, ?, ?, 'Complete bio and profile', '2027-04-01', 'complete')").bind(id("tsk"), eventId, sessionAi, speakerId),
    db.prepare("INSERT INTO speaker_tasks (id, event_id, session_id, speaker_id, title, due_at, status, task_type, accepted_types, max_file_bytes) VALUES (?, ?, ?, ?, 'Upload final slides', '2027-05-01', 'incomplete', 'file_request', '.pdf,.ppt,.pptx', 26214400)").bind(id("tsk"), eventId, sessionAi, speakerId),
    db.prepare("INSERT INTO speaker_tasks (id, event_id, session_id, speaker_id, title, due_at, status) VALUES (?, ?, ?, ?, 'Sign speaker release form', '2027-04-15', 'complete')").bind(id("tsk"), eventId, sessionAi, speakerId),
    db.prepare("INSERT INTO schedule_revisions (id, event_id, version, status, created_by, published_by, published_at) VALUES (?, ?, 1, 'published', ?, ?, CURRENT_TIMESTAMP)").bind(publishedRevision, eventId, organizerId, organizerId),
    db.prepare("INSERT INTO schedule_items (id, revision_id, session_id, room_id, starts_at, ends_at, locked) VALUES (?, ?, ?, ?, '2027-05-12T10:00:00-07:00', '2027-05-12T10:30:00-07:00', 0)").bind(id("sit"), publishedRevision, sessionAi, roomMain),
    db.prepare("INSERT INTO schedule_revisions (id, event_id, version, status, based_on_id, created_by) VALUES (?, ?, 2, 'draft', ?, ?)").bind(draftRevision, eventId, publishedRevision, organizerId),
    db.prepare("INSERT INTO schedule_items (id, revision_id, session_id, room_id, starts_at, ends_at, locked) VALUES (?, ?, ?, ?, '2027-05-12T10:00:00-07:00', '2027-05-12T10:30:00-07:00', 0)").bind(id("sit"), draftRevision, sessionAi, roomMain),
  ];

  for (const [templateKey, name, subject, body, mode] of [
    ["submitter_confirmation", "Submitter confirmation", "We received your DevFlow Conf proposal", "Hi {speaker_name}, your proposal '{proposal_title}' is safely in Program Desk.", "immediate"],
    ["new_submission", "Internal new submission", "New proposal: {proposal_title}", "A new proposal is ready for the organizing team.", "daily_digest"],
    ["reviewer_invitation", "Reviewer invitation", "Join the DevFlow Conf program committee", "Review approximately {estimated_count} proposals by {deadline}.", "manual"],
    ["review_assignments", "Assignments ready", "Your DevFlow Conf reviews are ready", "You have {assignment_count} proposals due {deadline}.", "manual"],
    ["speaker_acceptance", "Speaker acceptance", "Your talk has been accepted to DevFlow Conf 2027", "Hi {speaker_name}, congratulations! Your session '{proposal_title}' has been accepted.", "manual"],
    ["schedule_change", "Schedule change", "Your DevFlow Conf schedule changed", "Please review the updated time and room for '{session_title}'.", "manual"],
  ] as const) {
    statements.push(
      db.prepare("INSERT INTO communication_templates (id, event_id, template_key, name, subject, body, delivery_mode) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id("tpl"), eventId, templateKey, name, subject, body, mode),
    );
  }

  for (const [widgetType, name, outputFormat] of [
    ["sessions", "Sessions list", "script"],
    ["speakers", "Speakers directory", "iframe"],
    ["agenda", "Agenda", "url"],
    ["itinerary", "Schedule itinerary", "ical"],
    ["speaker_gallery", "Speaker gallery", "json"],
  ] as const) {
    statements.push(
      db.prepare("INSERT INTO public_embeds (id, event_id, name, widget_type, output_format, public_token) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id("emb"), eventId, name, widgetType, outputFormat, crypto.randomUUID().replaceAll("-", "")),
    );
  }

  statements.push(
    db.prepare("INSERT INTO audit_events (id, organization_id, event_id, actor_id, action, entity_type, entity_id, summary) VALUES (?, ?, ?, ?, 'workspace.seeded', 'event', ?, 'Created the DevFlow Conf demonstration workspace.')")
      .bind(id("aud"), organizationId, eventId, organizerId, eventId),
  );

  await db.batch(statements);
  return {
    organizationId,
    eventId,
    users: {
      organizer: organizerId,
      reviewer: reviewerId,
      speaker: speakerId,
      speaker2: speaker2Id,
    },
  };
}

export async function ensureCanonicalWorkspace(db: D1Database) {
  const existing = await db.prepare("SELECT id FROM organizations WHERE slug = 'devflow-evaluation'").first<{ id: string }>();
  if (existing) return;
  await seedProgramWorkspace(db, { canonical: true });
}
