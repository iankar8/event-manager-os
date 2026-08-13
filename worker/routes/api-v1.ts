import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AppEnv } from "../types";

const apiV1 = new Hono<AppEnv>();
apiV1.use("*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"] }));

const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Event Manager OS Public API",
    version: "1.0.0",
    description: "Event-scoped, read-only access to the same approved records used by the public program.",
  },
  paths: {
    "/api/v1/events/{slug}": { get: { summary: "Get a published event" } },
    "/api/v1/events/{slug}/sessions": { get: { summary: "List approved sessions in the published agenda" } },
    "/api/v1/events/{slug}/speakers": { get: { summary: "List speakers assigned to published sessions" } },
    "/api/v1/events/{slug}/agenda": { get: { summary: "Get the current published agenda revision" } },
    "/api/v1/events/{slug}/agenda.ics": { get: { summary: "Download the current published agenda as iCalendar" } },
  },
};

function error(code: string, message: string) {
  return { error: { code, message } };
}

async function publishedEvent(db: D1Database, slug: string) {
  return db.prepare(
    `SELECT events.id, events.name, events.slug, events.tagline, events.description, events.location,
            events.timezone, events.starts_on, events.ends_on, events.accent_color, events.updated_at,
            organizations.name AS organization_name
     FROM events JOIN organizations ON organizations.id = events.organization_id
     WHERE events.slug = ? AND events.public_status = 'published'`,
  ).bind(slug).first<Record<string, string | number | null>>();
}

function pageInput(rawPage?: string, rawLimit?: string) {
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(rawLimit ?? "50", 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

async function publishedSessions(db: D1Database, eventId: string, limit = 100, offset = 0) {
  return db.prepare(
    `SELECT sessions.id, sessions.title, sessions.description, sessions.updated_at,
            schedule_items.starts_at, schedule_items.ends_at, rooms.id AS room_id, rooms.name AS room_name,
            tracks.id AS track_id, tracks.name AS track_name, tracks.color AS track_color,
            session_formats.id AS format_id, session_formats.name AS format_name,
            GROUP_CONCAT(users.id, '||') AS speaker_ids,
            GROUP_CONCAT(users.name, '||') AS speaker_names
     FROM schedule_revisions
     JOIN schedule_items ON schedule_items.revision_id = schedule_revisions.id
     JOIN sessions ON sessions.id = schedule_items.session_id
     JOIN rooms ON rooms.id = schedule_items.room_id
     LEFT JOIN tracks ON tracks.id = sessions.track_id
     LEFT JOIN session_formats ON session_formats.id = sessions.format_id
     LEFT JOIN session_participants ON session_participants.session_id = sessions.id
     LEFT JOIN users ON users.id = session_participants.user_id
     WHERE schedule_revisions.event_id = ? AND schedule_revisions.status = 'published'
       AND sessions.content_status = 'approved'
     GROUP BY sessions.id
     ORDER BY schedule_items.starts_at, rooms.sort_order, sessions.title LIMIT ? OFFSET ?`,
  ).bind(eventId, limit, offset).all<Record<string, string | number | null>>();
}

apiV1.get("/openapi.json", (context) => context.json(openapi));

apiV1.get("/events/:slug", async (context) => {
  const event = await publishedEvent(context.env.DB, context.req.param("slug"));
  if (!event) return context.json(error("event_not_found", "Published event not found."), 404);
  return context.json({ data: event });
});

apiV1.get("/events/:slug/sessions", async (context) => {
  const event = await publishedEvent(context.env.DB, context.req.param("slug"));
  if (!event) return context.json(error("event_not_found", "Published event not found."), 404);
  const pagination = pageInput(context.req.query("page"), context.req.query("limit"));
  const [records, count] = await Promise.all([
    publishedSessions(context.env.DB, String(event.id), pagination.limit, pagination.offset),
    context.env.DB.prepare(
      `SELECT COUNT(DISTINCT sessions.id) AS count FROM schedule_revisions
       JOIN schedule_items ON schedule_items.revision_id = schedule_revisions.id
       JOIN sessions ON sessions.id = schedule_items.session_id
       WHERE schedule_revisions.event_id = ? AND schedule_revisions.status = 'published'
         AND sessions.content_status = 'approved'`,
    ).bind(event.id).first<{ count: number }>(),
  ]);
  const data = records.results.map((record) => ({ ...record,
    speaker_ids: record.speaker_ids ? String(record.speaker_ids).split("||") : [],
    speaker_names: record.speaker_names ? String(record.speaker_names).split("||") : [] }));
  return context.json({ data, pagination: { page: pagination.page, limit: pagination.limit, total: count?.count ?? 0 } });
});

apiV1.get("/events/:slug/speakers", async (context) => {
  const event = await publishedEvent(context.env.DB, context.req.param("slug"));
  if (!event) return context.json(error("event_not_found", "Published event not found."), 404);
  const pagination = pageInput(context.req.query("page"), context.req.query("limit"));
  const records = await context.env.DB.prepare(
    `SELECT users.id, users.name, users.title, users.company, users.bio, users.headshot_url,
            users.twitter, users.linkedin_url, users.updated_at,
            GROUP_CONCAT(DISTINCT sessions.id) AS session_ids
     FROM schedule_revisions
     JOIN schedule_items ON schedule_items.revision_id = schedule_revisions.id
     JOIN sessions ON sessions.id = schedule_items.session_id
     JOIN session_participants ON session_participants.session_id = sessions.id
     JOIN users ON users.id = session_participants.user_id
     WHERE schedule_revisions.event_id = ? AND schedule_revisions.status = 'published'
       AND sessions.content_status = 'approved'
     GROUP BY users.id ORDER BY users.name LIMIT ? OFFSET ?`,
  ).bind(event.id, pagination.limit, pagination.offset).all<Record<string, string | number | null>>();
  const data = records.results.map((record) => ({ ...record,
    session_ids: record.session_ids ? String(record.session_ids).split(",") : [] }));
  return context.json({ data, pagination: { page: pagination.page, limit: pagination.limit, returned: data.length } });
});

apiV1.get("/events/:slug/agenda", async (context) => {
  const event = await publishedEvent(context.env.DB, context.req.param("slug"));
  if (!event) return context.json(error("event_not_found", "Published event not found."), 404);
  const revision = await context.env.DB.prepare(
    `SELECT id, version, published_at, updated_at FROM schedule_revisions
     WHERE event_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1`,
  ).bind(event.id).first();
  const sessions = revision ? await publishedSessions(context.env.DB, String(event.id)) : { results: [] };
  return context.json({ data: { event, revision, sessions: sessions.results } });
});

function icalEscape(value: unknown) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function icalStamp(value: unknown) {
  return new Date(String(value)).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

apiV1.get("/events/:slug/agenda.ics", async (context) => {
  const event = await publishedEvent(context.env.DB, context.req.param("slug"));
  if (!event) return context.json(error("event_not_found", "Published event not found."), 404);
  const sessions = await publishedSessions(context.env.DB, String(event.id));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Event Manager OS//Public API v1//EN",
    `X-WR-CALNAME:${icalEscape(event.name)}`];
  for (const item of sessions.results) lines.push("BEGIN:VEVENT", `UID:${item.id}@programdesk`,
    `DTSTAMP:${icalStamp(item.updated_at)}`, `DTSTART:${icalStamp(item.starts_at)}`, `DTEND:${icalStamp(item.ends_at)}`,
    `SUMMARY:${icalEscape(item.title)}`, `DESCRIPTION:${icalEscape(item.description)}`,
    `LOCATION:${icalEscape(item.room_name)}`, "END:VEVENT");
  lines.push("END:VCALENDAR");
  return context.body(lines.join("\r\n"), 200, { "content-type": "text/calendar; charset=utf-8",
    "content-disposition": `attachment; filename="${event.slug}-agenda.ics"` });
});

export { apiV1 };
