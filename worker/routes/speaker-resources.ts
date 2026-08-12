import { Hono } from "hono";
import { z } from "zod";

import { isOrganizer, requireSession } from "../lib/access";
import { createId } from "../lib/crypto";
import type { AppEnv, SessionContext } from "../types";

const speakerResources = new Hono<AppEnv>();

const resourceInput = z.object({
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().max(500).default(""),
  body: z.string().trim().max(20_000).default(""),
  linkUrl: z.string().trim().max(2_048).default(""),
  linkLabel: z.string().trim().max(100).default(""),
  embedHtml: z.string().trim().max(5_000).default(""),
  status: z.enum(["draft", "published"]),
  scopeType: z.enum(["all", "session", "track", "speaker"]),
  scopeId: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

const embedRules = new Map<string, RegExp>([
  ["https://www.youtube.com", /^\/embed\/[A-Za-z0-9_-]+/],
  ["https://www.youtube-nocookie.com", /^\/embed\/[A-Za-z0-9_-]+/],
  ["https://player.vimeo.com", /^\/video\/\d+/],
  ["https://docs.google.com", /^\/(presentation|document|spreadsheets)\/d\/[^/]+\/(embed|preview)/],
  ["https://drive.google.com", /^\/file\/d\/[^/]+\/preview/],
  ["https://www.loom.com", /^\/embed\/[A-Za-z0-9_-]+/],
  ["https://slides.com", /^\/[^/]+\/[^/]+\/embed/],
]);

type ParsedEmbed = { embedUrl: string | null; embedTitle: string | null; error?: string };

function httpsUrl(raw: string, label: string) {
  if (!raw) return { value: null };
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return { value: null, error: `${label} must use HTTPS.` };
    return { value: url.toString() };
  } catch {
    return { value: null, error: `${label} must be a valid URL.` };
  }
}

export function parseSpeakerResourceEmbed(raw: string): ParsedEmbed {
  if (!raw) return { embedUrl: null, embedTitle: null };
  if (/<\/?(script|style|object|embed|form)\b|\son\w+\s*=|javascript:|\ssrcdoc\s*=/i.test(raw)) {
    return { embedUrl: null, embedTitle: null, error: "Unsafe embed HTML was rejected. Use one supported iframe only." };
  }
  const iframe = raw.match(/^\s*<iframe\b([^>]*)>\s*<\/iframe>\s*$/i);
  if (!iframe) return { embedUrl: null, embedTitle: null, error: "Embed HTML must contain one supported iframe only." };
  const source = iframe[1].match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2] ?? "";
  const title = iframe[1].match(/\btitle\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim() || "Embedded speaker resource";
  const parsed = httpsUrl(source, "Embed source");
  if (parsed.error || !parsed.value) return { embedUrl: null, embedTitle: null, error: parsed.error ?? "Embed source is required." };
  const url = new URL(parsed.value);
  const pathRule = embedRules.get(url.origin);
  if (!pathRule || !pathRule.test(url.pathname)) {
    return { embedUrl: null, embedTitle: null, error: "That iframe origin or embed path is not supported." };
  }
  return { embedUrl: url.toString(), embedTitle: title.slice(0, 160) };
}

async function validateScope(db: D1Database, session: SessionContext, scopeType: string, scopeId?: string | null) {
  if (scopeType === "all") return scopeId ? "Event-wide resources cannot include a scope ID." : null;
  if (!scopeId) return `Choose a ${scopeType} for this resource.`;
  const query = scopeType === "session"
    ? "SELECT id FROM sessions WHERE id = ? AND event_id = ?"
    : scopeType === "track"
      ? "SELECT id FROM tracks WHERE id = ? AND event_id = ?"
      : `SELECT users.id FROM event_members JOIN users ON users.id = event_members.user_id
         WHERE event_members.user_id = ? AND event_members.event_id = ? AND event_members.role = 'speaker'`;
  const found = await db.prepare(query).bind(scopeId, session.eventId).first();
  return found ? null : `That ${scopeType} is not part of the active event.`;
}

const resourceSelect = `
  SELECT speaker_resources.*, users.name AS author_name,
    CASE speaker_resources.scope_type
      WHEN 'all' THEN 'All event speakers'
      WHEN 'session' THEN COALESCE((SELECT title FROM sessions WHERE id = speaker_resources.scope_id AND event_id = speaker_resources.event_id), 'Missing session')
      WHEN 'track' THEN COALESCE((SELECT name FROM tracks WHERE id = speaker_resources.scope_id AND event_id = speaker_resources.event_id), 'Missing track')
      WHEN 'speaker' THEN COALESCE((SELECT name FROM users WHERE id = speaker_resources.scope_id), 'Missing speaker')
    END AS scope_label
  FROM speaker_resources JOIN users ON users.id = speaker_resources.author_id`;

async function readResource(db: D1Database, eventId: string, resourceId: string) {
  return db.prepare(`${resourceSelect} WHERE speaker_resources.event_id = ? AND speaker_resources.id = ?`)
    .bind(eventId, resourceId).first<Record<string, unknown>>();
}

speakerResources.get("/", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  if (!isOrganizer(session) && session.role !== "speaker") return context.json({ error: "Speaker resources are available to organizers and speakers only." }, 403);
  const organizer = isOrganizer(session);
  const resources = organizer
    ? await context.env.DB.prepare(`${resourceSelect}
        WHERE speaker_resources.event_id = ?
        ORDER BY speaker_resources.sort_order, speaker_resources.updated_at DESC`).bind(session.eventId).all()
    : await context.env.DB.prepare(`${resourceSelect}
        WHERE speaker_resources.event_id = ? AND speaker_resources.status = 'published' AND (
          speaker_resources.scope_type = 'all'
          OR (speaker_resources.scope_type = 'speaker' AND speaker_resources.scope_id = ?)
          OR (speaker_resources.scope_type = 'session' AND EXISTS (
            SELECT 1 FROM session_participants
            JOIN sessions ON sessions.id = session_participants.session_id
            WHERE sessions.id = speaker_resources.scope_id AND sessions.event_id = speaker_resources.event_id
              AND session_participants.user_id = ?
          ))
          OR (speaker_resources.scope_type = 'track' AND EXISTS (
            SELECT 1 FROM session_participants
            JOIN sessions ON sessions.id = session_participants.session_id
            WHERE sessions.track_id = speaker_resources.scope_id AND sessions.event_id = speaker_resources.event_id
              AND session_participants.user_id = ?
          ))
        ) ORDER BY speaker_resources.sort_order, speaker_resources.updated_at DESC`)
      .bind(session.eventId, session.userId, session.userId, session.userId).all();
  const [sessions, tracks, speakers, versions] = organizer ? await Promise.all([
    context.env.DB.prepare("SELECT id, title FROM sessions WHERE event_id = ? ORDER BY title").bind(session.eventId).all(),
    context.env.DB.prepare("SELECT id, name FROM tracks WHERE event_id = ? ORDER BY sort_order, name").bind(session.eventId).all(),
    context.env.DB.prepare(`SELECT users.id, users.name FROM event_members JOIN users ON users.id = event_members.user_id
      WHERE event_members.event_id = ? AND event_members.role = 'speaker' ORDER BY users.name`).bind(session.eventId).all(),
    context.env.DB.prepare(`SELECT speaker_resource_versions.*, users.name AS editor_name
      FROM speaker_resource_versions JOIN speaker_resources ON speaker_resources.id = speaker_resource_versions.resource_id
      JOIN users ON users.id = speaker_resource_versions.editor_id
      WHERE speaker_resources.event_id = ? ORDER BY speaker_resource_versions.created_at DESC LIMIT 100`).bind(session.eventId).all(),
  ]) : [{ results: [] }, { results: [] }, { results: [] }, { results: [] }];
  return context.json({ resources: resources.results, versions: versions.results,
    scopes: { sessions: sessions.results, tracks: tracks.results, speakers: speakers.results } });
});

speakerResources.post("/", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can create speaker resources." }, 403);
  const parsed = resourceInput.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Complete the resource title, state, audience, and valid content fields." }, 400);
  const scopeError = await validateScope(context.env.DB, session, parsed.data.scopeType, parsed.data.scopeId);
  if (scopeError) return context.json({ error: scopeError }, 400);
  const link = httpsUrl(parsed.data.linkUrl, "Resource link");
  if (link.error) return context.json({ error: link.error }, 400);
  const embed = parseSpeakerResourceEmbed(parsed.data.embedHtml);
  if (embed.error) return context.json({ error: embed.error }, 400);
  const resourceId = createId("rsc");
  await context.env.DB.prepare(`INSERT INTO speaker_resources
    (id, event_id, title, summary, body, link_url, link_label, embed_url, embed_title,
     status, scope_type, scope_id, sort_order, author_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(resourceId, session.eventId, parsed.data.title, parsed.data.summary, parsed.data.body,
      link.value, link.value ? parsed.data.linkLabel || "Open resource" : null, embed.embedUrl, embed.embedTitle,
      parsed.data.status, parsed.data.scopeType, parsed.data.scopeType === "all" ? null : parsed.data.scopeId,
      parsed.data.sortOrder, session.userId).run();
  const resource = await readResource(context.env.DB, session.eventId, resourceId);
  return context.json({ ok: true, resource, message: "Speaker resource created and scoped." }, 201);
});

speakerResources.patch("/:resourceId", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can edit speaker resources." }, 403);
  const current = await context.env.DB.prepare("SELECT * FROM speaker_resources WHERE id = ? AND event_id = ?")
    .bind(context.req.param("resourceId"), session.eventId).first<Record<string, unknown>>();
  if (!current) return context.json({ error: "Speaker resource not found." }, 404);
  const parsed = resourceInput.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Complete the resource title, state, audience, and valid content fields." }, 400);
  const scopeError = await validateScope(context.env.DB, session, parsed.data.scopeType, parsed.data.scopeId);
  if (scopeError) return context.json({ error: scopeError }, 400);
  const link = httpsUrl(parsed.data.linkUrl, "Resource link");
  if (link.error) return context.json({ error: link.error }, 400);
  const embed = parseSpeakerResourceEmbed(parsed.data.embedHtml);
  if (embed.error) return context.json({ error: embed.error }, 400);
  const nextVersion = Number(current.version) + 1;
  await context.env.DB.batch([
    context.env.DB.prepare(`INSERT INTO speaker_resource_versions
      (id, resource_id, event_id, version, snapshot_json, editor_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(createId("rsv"), current.id, session.eventId, current.version, JSON.stringify(current), session.userId),
    context.env.DB.prepare(`UPDATE speaker_resources SET title = ?, summary = ?, body = ?, link_url = ?, link_label = ?,
      embed_url = ?, embed_title = ?, status = ?, scope_type = ?, scope_id = ?, sort_order = ?, version = ?,
      author_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND event_id = ?`)
      .bind(parsed.data.title, parsed.data.summary, parsed.data.body, link.value,
        link.value ? parsed.data.linkLabel || "Open resource" : null, embed.embedUrl, embed.embedTitle,
        parsed.data.status, parsed.data.scopeType, parsed.data.scopeType === "all" ? null : parsed.data.scopeId,
        parsed.data.sortOrder, nextVersion, session.userId, current.id, session.eventId),
  ]);
  const resource = await readResource(context.env.DB, session.eventId, String(current.id));
  return context.json({ ok: true, resource, message: `Speaker resource saved as version ${nextVersion}.` });
});

export { speakerResources };
