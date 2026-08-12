import { Hono } from "hono";
import { z } from "zod";

import { isOrganizer, requireSession } from "../lib/access";
import { createId } from "../lib/crypto";
import type { AppEnv } from "../types";

const schedule = new Hono<AppEnv>();

async function activeDraft(db: D1Database, eventId: string, userId: string) {
  let draft = await db.prepare(
    "SELECT * FROM schedule_revisions WHERE event_id = ? AND status = 'draft' ORDER BY version DESC LIMIT 1",
  ).bind(eventId).first<{ id: string; version: number }>();
  if (draft) return draft;
  const published = await db.prepare(
    "SELECT * FROM schedule_revisions WHERE event_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1",
  ).bind(eventId).first<{ id: string; version: number }>();
  const draftId = createId("rev");
  await db.prepare(
    `INSERT INTO schedule_revisions (id, event_id, version, status, based_on_id, created_by)
     VALUES (?, ?, ?, 'draft', ?, ?)`,
  ).bind(draftId, eventId, (published?.version ?? 0) + 1, published?.id ?? null, userId).run();
  if (published) await db.prepare(
    `INSERT INTO schedule_items (id, revision_id, session_id, room_id, starts_at, ends_at, locked, override_reason)
     SELECT 'sit_' || lower(hex(randomblob(12))), ?, session_id, room_id, starts_at, ends_at, locked, override_reason
     FROM schedule_items WHERE revision_id = ?`,
  ).bind(draftId, published.id).run();
  draft = { id: draftId, version: (published?.version ?? 0) + 1 };
  return draft;
}

schedule.get("/", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const organizer = isOrganizer(session);
  const [event, rooms, tracks, formats, revisions, items, sessions] = await Promise.all([
    context.env.DB.prepare("SELECT id, name, starts_on, ends_on, timezone, default_session_minutes, public_status FROM events WHERE id = ?")
      .bind(session.eventId).first(),
    context.env.DB.prepare("SELECT * FROM rooms WHERE event_id = ? ORDER BY sort_order, name").bind(session.eventId).all(),
    context.env.DB.prepare("SELECT * FROM tracks WHERE event_id = ? ORDER BY sort_order, name").bind(session.eventId).all(),
    context.env.DB.prepare("SELECT * FROM session_formats WHERE event_id = ? ORDER BY sort_order, name").bind(session.eventId).all(),
    context.env.DB.prepare("SELECT * FROM schedule_revisions WHERE event_id = ? ORDER BY version DESC").bind(session.eventId).all(),
    context.env.DB.prepare(
      `SELECT schedule_items.*, schedule_revisions.status AS revision_status, schedule_revisions.version,
              sessions.title, sessions.description, sessions.content_status, rooms.name AS room_name,
              tracks.name AS track_name, tracks.color AS track_color, session_formats.name AS format_name,
              GROUP_CONCAT(users.name, ', ') AS speaker_names
       FROM schedule_items JOIN schedule_revisions ON schedule_revisions.id = schedule_items.revision_id
       JOIN sessions ON sessions.id = schedule_items.session_id JOIN rooms ON rooms.id = schedule_items.room_id
       LEFT JOIN tracks ON tracks.id = sessions.track_id LEFT JOIN session_formats ON session_formats.id = sessions.format_id
       LEFT JOIN session_participants ON session_participants.session_id = sessions.id
       LEFT JOIN users ON users.id = session_participants.user_id
       WHERE schedule_revisions.event_id = ? AND (? = 1 OR session_participants.user_id = ?)
       GROUP BY schedule_items.id ORDER BY schedule_revisions.version DESC, schedule_items.starts_at, rooms.sort_order`,
    ).bind(session.eventId, organizer ? 1 : 0, session.userId).all(),
    context.env.DB.prepare(
      `SELECT sessions.id, sessions.title, sessions.description, sessions.content_status,
              tracks.name AS track_name, tracks.id AS track_id, session_formats.name AS format_name,
              session_formats.duration_minutes, GROUP_CONCAT(users.name, ', ') AS speaker_names,
              GROUP_CONCAT(users.id, ',') AS speaker_ids
       FROM sessions LEFT JOIN tracks ON tracks.id = sessions.track_id
       LEFT JOIN session_formats ON session_formats.id = sessions.format_id
       LEFT JOIN session_participants ON session_participants.session_id = sessions.id
       LEFT JOIN users ON users.id = session_participants.user_id
       WHERE sessions.event_id = ? AND (? = 1 OR session_participants.user_id = ?)
       GROUP BY sessions.id ORDER BY sessions.title`,
    ).bind(session.eventId, organizer ? 1 : 0, session.userId).all(),
  ]);
  return context.json({ event, rooms: rooms.results, tracks: tracks.results, formats: formats.results,
    revisions: revisions.results, items: items.results, sessions: sessions.results });
});

schedule.post("/rooms", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can configure rooms." }, 403);
  const parsed = z.object({ name: z.string().min(2), capacity: z.number().int().positive().optional() })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Enter a room name and optional capacity." }, 400);
  const id = createId("rom");
  await context.env.DB.prepare(
    "INSERT INTO rooms (id, event_id, name, capacity, sort_order) VALUES (?, ?, ?, ?, (SELECT COUNT(*) + 1 FROM rooms WHERE event_id = ?))",
  ).bind(id, session.eventId, parsed.data.name, parsed.data.capacity ?? null, session.eventId).run();
  return context.json({ ok: true, id, message: "Room added and ready to schedule." });
});

schedule.post("/tracks", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can configure tracks." }, 403);
  const parsed = z.object({ name: z.string().min(2), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#16734b") })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Enter a track name and hex color." }, 400);
  const id = createId("trk");
  await context.env.DB.prepare(
    "INSERT INTO tracks (id, event_id, name, color, sort_order) VALUES (?, ?, ?, ?, (SELECT COUNT(*) + 1 FROM tracks WHERE event_id = ?))",
  ).bind(id, session.eventId, parsed.data.name, parsed.data.color, session.eventId).run();
  return context.json({ ok: true, id, message: "Track added and ready to use." });
});

const placementInput = z.object({
  sessionId: z.string(), roomId: z.string(), startsAt: z.string(), durationMinutes: z.number().int().min(5).max(480),
  allowConflict: z.boolean().default(false), overrideReason: z.string().default(""), locked: z.boolean().default(false),
});

schedule.post("/place", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can edit the agenda." }, 403);
  const parsed = placementInput.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Choose a session, room, start time, and duration." }, 400);
  const draft = await activeDraft(context.env.DB, session.eventId, session.userId);
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60_000);
  if (Number.isNaN(startsAt.getTime())) return context.json({ error: "Enter a valid start time." }, 400);
  const roomConflict = await context.env.DB.prepare(
    `SELECT sessions.title FROM schedule_items JOIN sessions ON sessions.id = schedule_items.session_id
     WHERE schedule_items.revision_id = ? AND schedule_items.room_id = ? AND schedule_items.session_id != ?
       AND julianday(schedule_items.starts_at) < julianday(?) AND julianday(schedule_items.ends_at) > julianday(?) LIMIT 1`,
  ).bind(draft.id, parsed.data.roomId, parsed.data.sessionId, endsAt.toISOString(), startsAt.toISOString()).first<{ title: string }>();
  const speakerConflict = await context.env.DB.prepare(
    `SELECT other.title FROM schedule_items
     JOIN session_participants target_speakers ON target_speakers.session_id = ?
     JOIN session_participants other_speakers ON other_speakers.user_id = target_speakers.user_id
     JOIN sessions other ON other.id = other_speakers.session_id AND other.id = schedule_items.session_id
     WHERE schedule_items.revision_id = ? AND schedule_items.session_id != ?
       AND julianday(schedule_items.starts_at) < julianday(?) AND julianday(schedule_items.ends_at) > julianday(?) LIMIT 1`,
  ).bind(parsed.data.sessionId, draft.id, parsed.data.sessionId, endsAt.toISOString(), startsAt.toISOString()).first<{ title: string }>();
  const conflicts = [roomConflict ? `Room conflict with “${roomConflict.title}”` : null,
    speakerConflict ? `Speaker double-booked with “${speakerConflict.title}”` : null].filter(Boolean);
  if (conflicts.length && !parsed.data.allowConflict) return context.json({ error: conflicts.join(". "), conflicts }, 409);
  if (conflicts.length && !parsed.data.overrideReason.trim()) return context.json({ error: "Explain why this conflict should be overridden." }, 400);
  await context.env.DB.prepare(
    `INSERT INTO schedule_items (id, revision_id, session_id, room_id, starts_at, ends_at, locked, override_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(revision_id, session_id) DO UPDATE SET room_id = excluded.room_id,
       starts_at = excluded.starts_at, ends_at = excluded.ends_at, locked = excluded.locked,
       override_reason = excluded.override_reason, updated_at = CURRENT_TIMESTAMP`,
  ).bind(createId("sit"), draft.id, parsed.data.sessionId, parsed.data.roomId, startsAt.toISOString(), endsAt.toISOString(),
    parsed.data.locked ? 1 : 0, parsed.data.overrideReason || null).run();
  return context.json({ ok: true, draftVersion: draft.version, conflicts,
    message: conflicts.length ? "Placement saved with a visible override." : "Draft placement saved." });
});

schedule.post("/auto-place", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can use automatic scheduling." }, 403);
  const draft = await activeDraft(context.env.DB, session.eventId, session.userId);
  const [event, rooms, unscheduled] = await Promise.all([
    context.env.DB.prepare("SELECT starts_on, default_session_minutes FROM events WHERE id = ?").bind(session.eventId)
      .first<{ starts_on: string; default_session_minutes: number }>(),
    context.env.DB.prepare("SELECT id FROM rooms WHERE event_id = ? ORDER BY sort_order").bind(session.eventId).all<{ id: string }>(),
    context.env.DB.prepare(
      `SELECT sessions.id, COALESCE(session_formats.duration_minutes, events.default_session_minutes) AS duration
       FROM sessions JOIN events ON events.id = sessions.event_id
       LEFT JOIN session_formats ON session_formats.id = sessions.format_id
       WHERE sessions.event_id = ? AND NOT EXISTS
         (SELECT 1 FROM schedule_items WHERE schedule_items.revision_id = ? AND schedule_items.session_id = sessions.id)
       ORDER BY sessions.title`,
    ).bind(session.eventId, draft.id).all<{ id: string; duration: number }>(),
  ]);
  if (!event || !rooms.results.length) return context.json({ error: "Add at least one room before auto-scheduling." }, 409);
  const statements: D1PreparedStatement[] = [];
  unscheduled.results.forEach((item, index) => {
    const start = new Date(`${event.starts_on}T09:00:00-07:00`);
    start.setMinutes(start.getMinutes() + Math.floor(index / rooms.results.length) * 60);
    const end = new Date(start.getTime() + Number(item.duration) * 60_000);
    statements.push(context.env.DB.prepare(
      "INSERT INTO schedule_items (id, revision_id, session_id, room_id, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(createId("sit"), draft.id, item.id, rooms.results[index % rooms.results.length].id, start.toISOString(), end.toISOString()));
  });
  if (statements.length) await context.env.DB.batch(statements);
  return context.json({ ok: true, placed: statements.length,
    message: `${statements.length} session${statements.length === 1 ? "" : "s"} placed into conflict-free starting slots.` });
});

schedule.post("/publish", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can publish the agenda." }, 403);
  const draft = await context.env.DB.prepare(
    "SELECT id, version FROM schedule_revisions WHERE event_id = ? AND status = 'draft' ORDER BY version DESC LIMIT 1",
  ).bind(session.eventId).first<{ id: string; version: number }>();
  if (!draft) return context.json({ error: "There is no draft schedule to publish." }, 409);
  const itemCount = await context.env.DB.prepare("SELECT COUNT(*) AS count FROM schedule_items WHERE revision_id = ?")
    .bind(draft.id).first<{ count: number }>();
  if (!itemCount?.count) return context.json({ error: "Place at least one session before publishing." }, 409);
  await context.env.DB.batch([
    context.env.DB.prepare("UPDATE schedule_revisions SET status = 'superseded' WHERE event_id = ? AND status = 'published'").bind(session.eventId),
    context.env.DB.prepare(
      "UPDATE schedule_revisions SET status = 'published', published_by = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(session.userId, draft.id),
    context.env.DB.prepare("UPDATE events SET public_status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(session.eventId),
    context.env.DB.prepare(
      `INSERT INTO audit_events (id, organization_id, event_id, actor_id, action, entity_type, entity_id, summary)
       VALUES (?, ?, ?, ?, 'schedule.published', 'schedule_revision', ?, ?)`,
    ).bind(createId("aud"), session.organizationId, session.eventId, session.userId, draft.id, `Published schedule revision ${draft.version}.`),
  ]);
  return context.json({ ok: true, version: draft.version, message: `Schedule revision ${draft.version} is now public.` });
});

export { schedule };
