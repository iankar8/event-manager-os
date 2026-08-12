import { Hono } from "hono";
import { z } from "zod";

import { isOrganizer, requireSession } from "../lib/access";
import { createId } from "../lib/crypto";
import type { AppEnv } from "../types";

const events = new Hono<AppEnv>();

const createEventInput = z.object({
  name: z.string().min(3).max(120),
  startsOn: z.string().min(10),
  endsOn: z.string().min(10),
  location: z.string().max(200).default(""),
});

events.get("/", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);

  const rows = await context.env.DB.prepare(
    `SELECT events.id, events.name, events.slug, events.starts_on, events.ends_on,
            events.location, events.status, events.public_status,
            CASE WHEN events.id = ? THEN 1 ELSE 0 END AS active
     FROM events
     WHERE events.organization_id = ?
       AND (? = 1 OR EXISTS (
         SELECT 1 FROM event_members
         WHERE event_members.event_id = events.id AND event_members.user_id = ?
       ))
     ORDER BY events.starts_on`,
  ).bind(session.eventId, session.organizationId, isOrganizer(session) ? 1 : 0, session.userId)
    .all();

  return context.json({ events: rows.results });
});

events.post("/", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  if (!isOrganizer(session)) return context.json({ error: "Only organizers can create events." }, 403);
  const parsed = createEventInput.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Enter an event name, dates, and location." }, 400);

  const eventId = createId("evt");
  const slugBase = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 5)}`;
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO events
       (id, organization_id, name, slug, location, starts_on, ends_on, status, public_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'private')`,
    ).bind(eventId, session.organizationId, parsed.data.name, slug, parsed.data.location, parsed.data.startsOn, parsed.data.endsOn),
    context.env.DB.prepare(
      "INSERT INTO event_members (event_id, user_id, role, status) VALUES (?, ?, 'organizer', 'active')",
    ).bind(eventId, session.userId),
    context.env.DB.prepare(
      `INSERT INTO audit_events
       (id, organization_id, event_id, actor_id, action, entity_type, entity_id, summary)
       VALUES (?, ?, ?, ?, 'event.created', 'event', ?, ?)`,
    ).bind(createId("aud"), session.organizationId, eventId, session.userId, eventId, `Created ${parsed.data.name}.`),
  ]);
  return context.json({ ok: true, eventId, slug }, 201);
});

events.post("/:eventId/switch", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const target = await context.env.DB.prepare(
    `SELECT events.id,
       COALESCE((SELECT role FROM event_members WHERE event_id = events.id AND user_id = ?
         ORDER BY CASE role WHEN 'organizer' THEN 1 WHEN 'reviewer' THEN 2 ELSE 3 END LIMIT 1), ?) AS role
     FROM events WHERE events.id = ? AND events.organization_id = ?`,
  ).bind(session.userId, isOrganizer(session) ? "organizer" : session.role, context.req.param("eventId"), session.organizationId)
    .first<{ id: string; role: string }>();
  if (!target) return context.json({ error: "That event is outside your organization." }, 404);
  if (!isOrganizer(session)) {
    const member = await context.env.DB.prepare(
      "SELECT role FROM event_members WHERE event_id = ? AND user_id = ?",
    ).bind(target.id, session.userId).first();
    if (!member) return context.json({ error: "You do not have access to that event." }, 403);
  }

  await context.env.DB.prepare(
    "UPDATE auth_sessions SET active_event_id = ?, active_role = ? WHERE id = ?",
  ).bind(target.id, target.role, session.sessionId).run();
  return context.json({ ok: true });
});

export { events };
