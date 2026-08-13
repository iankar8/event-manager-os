import { Hono } from "hono";
import { z } from "zod";

import { createId, hashPassword, hashToken } from "../lib/crypto";
import { createSession, deleteSession, getSession } from "../lib/session";
import { attachCoSpeakers, coSpeakerInput } from "../services/participants";
import type { AppEnv } from "../types";

const publicRoutes = new Hono<AppEnv>();

async function publicEvent(db: D1Database, slug: string) {
  return db.prepare(
    `SELECT events.*, organizations.name AS organization_name FROM events
     JOIN organizations ON organizations.id = events.organization_id WHERE events.slug = ?`,
  ).bind(slug).first<Record<string, string | number | null>>();
}

publicRoutes.get("/:slug", async (context) => {
  const event = await publicEvent(context.env.DB, context.req.param("slug"));
  if (!event) return context.json({ error: "Event not found." }, 404);
  const [form, fields, tracks, formats, sessions, speakers] = await Promise.all([
    context.env.DB.prepare("SELECT * FROM cfp_forms WHERE event_id = ? ORDER BY created_at LIMIT 1").bind(event.id).first(),
    context.env.DB.prepare(
      `SELECT cfp_fields.* FROM cfp_fields JOIN cfp_forms ON cfp_forms.id = cfp_fields.form_id
       WHERE cfp_forms.event_id = ? ORDER BY cfp_fields.sort_order`,
    ).bind(event.id).all(),
    context.env.DB.prepare("SELECT * FROM tracks WHERE event_id = ? ORDER BY sort_order, name").bind(event.id).all(),
    context.env.DB.prepare("SELECT * FROM session_formats WHERE event_id = ? ORDER BY sort_order, name").bind(event.id).all(),
    context.env.DB.prepare(
      `SELECT sessions.id, sessions.title, sessions.description, schedule_items.starts_at, schedule_items.ends_at,
              rooms.name AS room_name, tracks.name AS track_name, tracks.color AS track_color,
              session_formats.name AS format_name, GROUP_CONCAT(users.name, '||') AS speaker_names,
              GROUP_CONCAT(COALESCE(users.title, ''), '||') AS speaker_titles,
              GROUP_CONCAT(COALESCE(users.company, ''), '||') AS speaker_companies,
              GROUP_CONCAT(users.id, '||') AS speaker_ids
       FROM schedule_revisions JOIN schedule_items ON schedule_items.revision_id = schedule_revisions.id
       JOIN sessions ON sessions.id = schedule_items.session_id JOIN rooms ON rooms.id = schedule_items.room_id
       LEFT JOIN tracks ON tracks.id = sessions.track_id LEFT JOIN session_formats ON session_formats.id = sessions.format_id
       LEFT JOIN session_participants ON session_participants.session_id = sessions.id LEFT JOIN users ON users.id = session_participants.user_id
       WHERE schedule_revisions.event_id = ? AND schedule_revisions.status = 'published' AND sessions.content_status = 'approved'
       GROUP BY sessions.id ORDER BY schedule_items.starts_at, rooms.sort_order`,
    ).bind(event.id).all(),
    context.env.DB.prepare(
      `SELECT DISTINCT users.id, users.name, users.title, users.company, users.bio, users.headshot_url
       FROM sessions JOIN schedule_items ON schedule_items.session_id = sessions.id
       JOIN schedule_revisions ON schedule_revisions.id = schedule_items.revision_id
       JOIN session_participants ON session_participants.session_id = sessions.id
       JOIN users ON users.id = session_participants.user_id
       WHERE sessions.event_id = ? AND schedule_revisions.status = 'published' AND sessions.content_status = 'approved'
       ORDER BY substr(users.name, instr(users.name, ' ') + 1), users.name`,
    ).bind(event.id).all(),
  ]);
  const enhancedFields = fields.results.map((raw) => {
    const field = raw as Record<string, unknown>;
    if (field.field_key === "track") return { ...field, options_json: JSON.stringify(tracks.results.map((track) => (track as { name: string }).name)) };
    if (field.field_key === "format") return { ...field, options_json: JSON.stringify(formats.results.map((format) => (format as { name: string }).name)) };
    return field;
  });
  return context.json({ event, form, fields: enhancedFields, tracks: tracks.results, formats: formats.results,
    sessions: sessions.results, speakers: speakers.results });
});

publicRoutes.post("/:slug/signup", async (context) => {
  const event = await publicEvent(context.env.DB, context.req.param("slug"));
  if (!event) return context.json({ error: "Event not found." }, 404);
  const parsed = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8),
    title: z.string().default(""), company: z.string().default(""), bio: z.string().default("") })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Add your name, email, and a password of at least 8 characters." }, 400);
  const existing = await context.env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE")
    .bind(parsed.data.email).first<{ id: string }>();
  if (existing) return context.json({ error: "An account already exists for that email. Sign in instead." }, 409);
  const userId = createId("usr");
  await context.env.DB.batch([
    context.env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, name, title, company, bio) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(userId, parsed.data.email.toLowerCase(), await hashPassword(parsed.data.password), parsed.data.name,
      parsed.data.title, parsed.data.company, parsed.data.bio),
    context.env.DB.prepare(
      "INSERT INTO event_members (event_id, user_id, role, status) VALUES (?, ?, 'speaker', 'active')",
    ).bind(event.id, userId),
  ]);
  await deleteSession(context);
  await createSession(context, { userId, organizationId: String(event.organization_id), eventId: String(event.id), role: "speaker", isDemo: false });
  return context.json({ ok: true, message: "Submitter account created." }, 201);
});

publicRoutes.post("/:slug/proposals", async (context) => {
  const event = await publicEvent(context.env.DB, context.req.param("slug"));
  if (!event) return context.json({ error: "Event not found." }, 404);
  const session = await getSession(context);
  if (!session || session.eventId !== event.id || session.role !== "speaker") return context.json({ error: "Sign in with a speaker account to submit." }, 401);
  const form = await context.env.DB.prepare("SELECT * FROM cfp_forms WHERE event_id = ? ORDER BY created_at LIMIT 1")
    .bind(event.id).first<Record<string, string | null>>();
  const now = Date.now();
  if (!form || form.status !== "published" || (form.opens_at && new Date(form.opens_at).getTime() > now) ||
    (form.closes_at && new Date(form.closes_at).getTime() < now)) return context.json({ error: "Submissions are closed." }, 409);
  const parsed = z.object({ title: z.string().min(3), abstract: z.string().default(""), trackId: z.string().nullable().optional(),
    formatId: z.string().nullable().optional(), audienceLevel: z.string().optional(), notesForReviewers: z.string().optional(),
    keyTakeaway: z.string().optional(), workshopPrerequisites: z.string().optional(), speakerBio: z.string().optional(),
    coSpeakers: coSpeakerInput, status: z.enum(["draft", "submitted"]),
    answers: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())])).default({}) })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Add a proposal title." }, 400);
  if (parsed.data.status === "submitted" && (!parsed.data.abstract || !parsed.data.trackId || !parsed.data.formatId || !parsed.data.keyTakeaway)) {
    return context.json({ error: "Abstract, track, format, and Key takeaway are required." }, 400);
  }
  const [fields, selectedTrack, selectedFormat] = await Promise.all([
    context.env.DB.prepare(
      `SELECT cfp_fields.* FROM cfp_fields JOIN cfp_forms ON cfp_forms.id = cfp_fields.form_id
       WHERE cfp_forms.id = ? ORDER BY cfp_fields.sort_order`,
    ).bind(form.id).all<Record<string, string | number | null>>(),
    parsed.data.trackId ? context.env.DB.prepare("SELECT name FROM tracks WHERE id = ? AND event_id = ?")
      .bind(parsed.data.trackId, event.id).first<{ name: string }>() : Promise.resolve(null),
    parsed.data.formatId ? context.env.DB.prepare("SELECT name FROM session_formats WHERE id = ? AND event_id = ?")
      .bind(parsed.data.formatId, event.id).first<{ name: string }>() : Promise.resolve(null),
  ]);
  const coreKeys = new Set(["title", "abstract", "track", "format", "audience", "speaker_bio", "key_takeaway", "workshop_prerequisites"]);
  const customFields = fields.results.filter((field) => !coreKeys.has(String(field.field_key)));
  const answerByKey = new Map(customFields.map((field) => [String(field.field_key), parsed.data.answers[String(field.id)]]));
  const conditionMatches = (field: Record<string, string | number | null>) => {
    if (!field.condition_field_key) return true;
    const actual = field.condition_field_key === "format" ? selectedFormat?.name
      : field.condition_field_key === "track" ? selectedTrack?.name : answerByKey.get(String(field.condition_field_key));
    return String(actual ?? "") === String(field.condition_value ?? "");
  };
  if (parsed.data.status === "submitted" && customFields.some((field) => field.required === 1 && conditionMatches(field)
    && (parsed.data.answers[String(field.id)] === undefined || parsed.data.answers[String(field.id)] === ""))) {
    return context.json({ error: "Complete every required custom field before submitting." }, 400);
  }
  const proposalId = createId("pro");
  const statements = [
    context.env.DB.prepare(
      `INSERT INTO proposals
       (id, event_id, submitter_id, title, abstract, track_id, format_id, audience_level,
        notes_for_reviewers, key_takeaway, workshop_prerequisites, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
    ).bind(proposalId, event.id, session.userId, parsed.data.title, parsed.data.abstract, parsed.data.trackId ?? null,
      parsed.data.formatId ?? null, parsed.data.audienceLevel ?? null, parsed.data.notesForReviewers ?? null,
      parsed.data.keyTakeaway ?? null, parsed.data.workshopPrerequisites ?? null, parsed.data.status, parsed.data.status),
    context.env.DB.prepare(
      "INSERT INTO proposal_participants (proposal_id, user_id, role_label, is_primary, sort_order) VALUES (?, ?, 'Primary speaker', 1, 1)",
    ).bind(proposalId, session.userId),
  ];
  // The bio is collected on the submission form, so it has to reach the speaker's
  // profile; previously the field was rendered but never read, and whatever the
  // speaker typed was discarded on submit. Only fill an empty profile — a returning
  // speaker's curated bio is authoritative and a new proposal must not overwrite it.
  if (parsed.data.speakerBio?.trim()) {
    statements.push(context.env.DB.prepare(
      "UPDATE users SET bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (bio IS NULL OR TRIM(bio) = '')",
    ).bind(parsed.data.speakerBio.trim(), session.userId));
  }
  statements.push(...await attachCoSpeakers(context.env.DB, {
    eventId: String(event.id), proposalId, submitterId: session.userId, coSpeakers: parsed.data.coSpeakers,
  }));
  for (const field of customFields) {
    const value = parsed.data.answers[String(field.id)];
    if (value === undefined || value === "") continue;
    statements.push(context.env.DB.prepare(
      "INSERT INTO proposal_answers (proposal_id, field_id, value_json) VALUES (?, ?, ?)",
    ).bind(proposalId, field.id, JSON.stringify(value)));
  }
  if (parsed.data.status === "submitted") {
    statements.push(
      context.env.DB.prepare(
        `INSERT INTO communications
         (id, event_id, related_type, related_id, recipient_email, subject, body, status, sent_at)
         VALUES (?, ?, 'submission_confirmation', ?, ?, ?, ?, 'sent', CURRENT_TIMESTAMP)`,
      ).bind(createId("com"), event.id, proposalId, session.email, `We received your ${event.name} proposal`,
        `Hi ${session.name}, your proposal '${parsed.data.title}' is safely in Event Manager OS.`),
      context.env.DB.prepare(
        `INSERT INTO communications
         (id, event_id, related_type, related_id, recipient_email, subject, body, status, sent_at)
         SELECT ?, ?, 'new_submission', ?, users.email, ?, ?, 'sent', CURRENT_TIMESTAMP
         FROM event_members JOIN users ON users.id = event_members.user_id
         WHERE event_members.event_id = ? AND event_members.role = 'organizer' LIMIT 1`,
      ).bind(createId("com"), event.id, proposalId, `New proposal: ${parsed.data.title}`,
        "A new proposal is ready for the organizing team.", event.id),
    );
  }
  await context.env.DB.batch(statements);
  return context.json({ ok: true, proposalId,
    message: parsed.data.status === "draft" ? "Draft saved. Return any time before the deadline." : "Proposal submitted. A confirmation email has been logged." }, 201);
});

publicRoutes.get("/:slug/feed/:widget", async (context) => {
  const event = await publicEvent(context.env.DB, context.req.param("slug"));
  if (!event) return context.json({ error: "Event not found." }, 404);
  const token = context.req.query("token");
  if (token) {
    const embed = await context.env.DB.prepare(
      "SELECT id FROM public_embeds WHERE event_id = ? AND public_token = ? AND enabled = 1",
    ).bind(event.id, token).first();
    if (!embed) return context.json({ error: "Embed token not found." }, 404);
  }
  const sessions = await context.env.DB.prepare(
    `SELECT sessions.id, sessions.title, sessions.description, schedule_items.starts_at, schedule_items.ends_at,
            rooms.name AS room, tracks.name AS track, session_formats.name AS format,
            GROUP_CONCAT(users.name, ', ') AS speakers
     FROM schedule_revisions JOIN schedule_items ON schedule_items.revision_id = schedule_revisions.id
     JOIN sessions ON sessions.id = schedule_items.session_id JOIN rooms ON rooms.id = schedule_items.room_id
     LEFT JOIN tracks ON tracks.id = sessions.track_id LEFT JOIN session_formats ON session_formats.id = sessions.format_id
     LEFT JOIN session_participants ON session_participants.session_id = sessions.id LEFT JOIN users ON users.id = session_participants.user_id
     WHERE schedule_revisions.event_id = ? AND schedule_revisions.status = 'published' AND sessions.content_status = 'approved'
     GROUP BY sessions.id ORDER BY schedule_items.starts_at`,
  ).bind(event.id).all<Record<string, string>>();
  const selectedIds = new Set((context.req.query("ids") ?? "").split(",").filter(Boolean));
  const feedSessions = selectedIds.size ? sessions.results.filter((item) => selectedIds.has(item.id)) : sessions.results;
  if (context.req.param("widget") === "itinerary" && context.req.query("format") === "ical") {
    const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `X-WR-CALNAME:${event.name}`];
    feedSessions.forEach((item) => lines.push("BEGIN:VEVENT", `UID:${item.id}@programdesk`, `DTSTART:${stamp(item.starts_at)}`,
      `DTEND:${stamp(item.ends_at)}`, `SUMMARY:${item.title}`, `LOCATION:${item.room}`, `DESCRIPTION:${item.description}`, "END:VEVENT"));
    lines.push("END:VCALENDAR");
    return new Response(lines.join("\r\n"), { headers: { "content-type": "text/calendar",
      "content-disposition": `attachment; filename="${String(event.slug)}-itinerary.ics"` } });
  }
  return context.json({ event: { name: event.name, slug: event.slug }, widget: context.req.param("widget"), sessions: feedSessions });
});

publicRoutes.get("/share/:token", async (context) => {
  const share = await context.env.DB.prepare(
    `SELECT external_shares.*, proposals.title, proposals.abstract, proposals.status, tracks.name AS track_name,
            session_formats.name AS format_name FROM external_shares
     JOIN proposals ON proposals.id = external_shares.resource_id
     LEFT JOIN tracks ON tracks.id = proposals.track_id LEFT JOIN session_formats ON session_formats.id = proposals.format_id
     WHERE external_shares.token_hash = ? AND external_shares.revoked_at IS NULL AND external_shares.expires_at > CURRENT_TIMESTAMP`,
  ).bind(await hashToken(context.req.param("token"))).first();
  return share ? context.json({ share }) : context.json({ error: "This share link is invalid or expired." }, 410);
});

export { publicRoutes };
