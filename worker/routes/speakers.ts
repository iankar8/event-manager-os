import { Hono } from "hono";
import { z } from "zod";
import { strToU8, zipSync } from "fflate";

import { isOrganizer, requireSession } from "../lib/access";
import { createId, createToken, hashToken } from "../lib/crypto";
import type { AppEnv } from "../types";

const speakers = new Hono<AppEnv>();

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value); value = ""; }
    else value += char;
  }
  values.push(value);
  return values;
}

speakers.get("/", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const organizer = isOrganizer(session);
  const [people, tasks, files, comments, sessions, history] = await Promise.all([
    context.env.DB.prepare(
      `SELECT users.id, users.name, users.email, users.title, users.company, users.bio, users.headshot_url,
              users.twitter, users.linkedin_url, users.dietary_preferences, users.tshirt_size,
              users.travel_preferences, users.workflow_status, users.organizer_note,
              COUNT(DISTINCT speaker_tasks.id) AS task_count,
              COUNT(DISTINCT CASE WHEN speaker_tasks.status = 'complete' THEN speaker_tasks.id END) AS completed_tasks,
              COUNT(DISTINCT session_participants.session_id) AS session_count
       FROM event_members JOIN users ON users.id = event_members.user_id
       LEFT JOIN speaker_tasks ON speaker_tasks.speaker_id = users.id AND speaker_tasks.event_id = event_members.event_id
       LEFT JOIN session_participants ON session_participants.user_id = users.id
       LEFT JOIN sessions ON sessions.id = session_participants.session_id AND sessions.event_id = event_members.event_id
       WHERE event_members.event_id = ? AND event_members.role = 'speaker' AND (? = 1 OR users.id = ?)
       GROUP BY users.id ORDER BY users.name`,
    ).bind(session.eventId, organizer ? 1 : 0, session.userId).all(),
    context.env.DB.prepare(
      `SELECT speaker_tasks.*, users.name AS speaker_name, sessions.title AS session_title,
              COUNT(deliverable_files.id) AS version_count,
              MAX(CASE WHEN deliverable_files.is_latest = 1 THEN deliverable_files.file_name END) AS latest_file_name
       FROM speaker_tasks JOIN users ON users.id = speaker_tasks.speaker_id
       LEFT JOIN sessions ON sessions.id = speaker_tasks.session_id
       LEFT JOIN deliverable_files ON deliverable_files.task_id = speaker_tasks.id
       WHERE speaker_tasks.event_id = ? AND (? = 1 OR speaker_tasks.speaker_id = ?)
       GROUP BY speaker_tasks.id ORDER BY speaker_tasks.due_at, speaker_tasks.title`,
    ).bind(session.eventId, organizer ? 1 : 0, session.userId).all(),
    context.env.DB.prepare(
      `SELECT deliverable_files.id, deliverable_files.task_id, deliverable_files.session_id,
              deliverable_files.speaker_id, deliverable_files.file_name, deliverable_files.mime_type,
              deliverable_files.size_bytes, deliverable_files.version, deliverable_files.is_latest,
              deliverable_files.created_at, users.name AS speaker_name, speaker_tasks.title AS task_title,
              sessions.title AS session_title
       FROM deliverable_files JOIN users ON users.id = deliverable_files.speaker_id
       JOIN speaker_tasks ON speaker_tasks.id = deliverable_files.task_id
       LEFT JOIN sessions ON sessions.id = deliverable_files.session_id
       WHERE speaker_tasks.event_id = ? AND (? = 1 OR deliverable_files.speaker_id = ?)
       ORDER BY deliverable_files.created_at DESC`,
    ).bind(session.eventId, organizer ? 1 : 0, session.userId).all(),
    context.env.DB.prepare(
      `SELECT deliverable_comments.id, deliverable_comments.file_id, deliverable_comments.body,
              deliverable_comments.created_at, users.name AS author_name
       FROM deliverable_comments JOIN users ON users.id = deliverable_comments.author_id
       JOIN deliverable_files ON deliverable_files.id = deliverable_comments.file_id
       JOIN speaker_tasks ON speaker_tasks.id = deliverable_files.task_id
       WHERE speaker_tasks.event_id = ? AND (? = 1 OR deliverable_files.speaker_id = ?)
       ORDER BY deliverable_comments.created_at`,
    ).bind(session.eventId, organizer ? 1 : 0, session.userId).all(),
    context.env.DB.prepare(
      `SELECT sessions.id, sessions.title, sessions.description, sessions.content_status,
              users.id AS speaker_id, users.name AS speaker_name, tracks.name AS track_name,
              session_formats.name AS format_name
       FROM sessions JOIN session_participants ON session_participants.session_id = sessions.id
       JOIN users ON users.id = session_participants.user_id
       LEFT JOIN tracks ON tracks.id = sessions.track_id
       LEFT JOIN session_formats ON session_formats.id = sessions.format_id
       WHERE sessions.event_id = ? AND (? = 1 OR users.id = ?) ORDER BY sessions.title`,
    ).bind(session.eventId, organizer ? 1 : 0, session.userId).all(),
    organizer ? context.env.DB.prepare(
      `SELECT content_versions.*, users.name AS editor_name FROM content_versions
       LEFT JOIN users ON users.id = content_versions.editor_id WHERE content_versions.event_id = ?
       ORDER BY content_versions.created_at DESC LIMIT 50`,
    ).bind(session.eventId).all() : Promise.resolve({ results: [] }),
  ]);
  return context.json({ speakers: people.results, tasks: tasks.results, files: files.results, comments: comments.results,
    sessions: sessions.results, history: history.results });
});

speakers.post("/", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can add speakers." }, 403);
  const parsed = z.object({ name: z.string().min(2), email: z.string().email(), title: z.string().default(""),
    company: z.string().default(""), bio: z.string().default("") }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Add the speaker's name and a valid email address." }, 400);
  const existing = await context.env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE")
    .bind(parsed.data.email).first<{ id: string }>();
  const speakerId = existing?.id ?? createId("usr");
  await context.env.DB.batch([
    existing ? context.env.DB.prepare(
      "UPDATE users SET name = ?, title = ?, company = ?, bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(parsed.data.name, parsed.data.title, parsed.data.company, parsed.data.bio, speakerId)
      : context.env.DB.prepare(
        "INSERT INTO users (id, email, name, title, company, bio) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(speakerId, parsed.data.email.toLowerCase(), parsed.data.name, parsed.data.title, parsed.data.company, parsed.data.bio),
    context.env.DB.prepare(
      "INSERT OR IGNORE INTO event_members (event_id, user_id, role, status) VALUES (?, ?, 'speaker', 'invited')",
    ).bind(session.eventId, speakerId),
  ]);
  return context.json({ ok: true, speakerId, message: "Speaker added to this event's roster." }, 201);
});

speakers.post("/:speakerId/invite", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can invite speakers." }, 403);
  const speaker = await context.env.DB.prepare(
    `SELECT users.email, users.name FROM event_members JOIN users ON users.id = event_members.user_id
     WHERE event_members.event_id = ? AND event_members.user_id = ? AND event_members.role = 'speaker'`,
  ).bind(session.eventId, context.req.param("speakerId")).first<{ email: string; name: string }>();
  if (!speaker) return context.json({ error: "Speaker not found." }, 404);
  const token = createToken();
  const portalUrl = `/api/auth/magic/${token}`;
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO magic_links (id, email, purpose, token_hash, event_id, expires_at)
       VALUES (?, ?, 'speaker_portal', ?, ?, ?)`,
    ).bind(createId("mag"), speaker.email, await hashToken(token), session.eventId,
      new Date(Date.now() + 14 * 86_400_000).toISOString()),
    context.env.DB.prepare(
      `INSERT INTO communications
       (id, event_id, related_type, related_id, sender_id, recipient_email, subject, body, status, sent_at)
       VALUES (?, ?, 'speaker_invitation', ?, ?, ?, ?, ?, 'sent', CURRENT_TIMESTAMP)`,
    ).bind(createId("com"), session.eventId, context.req.param("speakerId"), session.userId, speaker.email,
      `Your ${session.eventName} speaker portal`, `Hi ${speaker.name}, use your secure link to open the speaker portal: ${portalUrl}`),
  ]);
  return context.json({ ok: true, portalUrl, message: "Speaker portal invitation logged with a 14-day magic link." });
});

speakers.post("/tasks/:taskId/reopen", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  // An accidental completion must be reversible by the speaker who owns the task
  // or an organizer; a permanent Complete badge turns a misclick into false
  // readiness data.
  const result = await context.env.DB.prepare(
    `UPDATE speaker_tasks SET status = 'incomplete', completed_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND event_id = ? AND (? = 1 OR speaker_id = ?)`,
  ).bind(context.req.param("taskId"), session.eventId, isOrganizer(session) ? 1 : 0, session.userId).run();
  return result.meta.changes ? context.json({ ok: true, message: "Task reopened." }) : context.json({ error: "Task not found." }, 404);
});

speakers.patch("/:speakerId", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const speakerId = context.req.param("speakerId");
  if (!isOrganizer(session) && session.userId !== speakerId) return context.json({ error: "You can update only your own speaker profile." }, 403);
  const member = await context.env.DB.prepare(
    "SELECT users.* FROM event_members JOIN users ON users.id = event_members.user_id WHERE event_members.event_id = ? AND users.id = ? AND event_members.role = 'speaker'",
  ).bind(session.eventId, speakerId).first<Record<string, unknown>>();
  if (!member) return context.json({ error: "Speaker not found." }, 404);
  const parsed = z.object({ name: z.string().min(2).optional(), title: z.string().optional(), company: z.string().optional(),
    bio: z.string().optional(), twitter: z.string().optional(), linkedinUrl: z.string().optional(),
    dietaryPreferences: z.string().optional(), tshirtSize: z.string().optional(), travelPreferences: z.string().optional(),
    workflowStatus: z.enum(["active", "invited", "confirmed", "declined"]).optional(), organizerNote: z.string().max(4000).optional(),
    headshotUrl: z.string().max(1_500_000).refine((value) => value === "" || /^data:image\/(png|jpeg|webp);base64,/.test(value), "Use a PNG, JPEG, or WebP profile photo.").optional() })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "The speaker profile update is invalid." }, 400);
  if (!isOrganizer(session) && (parsed.data.workflowStatus !== undefined || parsed.data.organizerNote !== undefined)) {
    return context.json({ error: "Organizer-only fields cannot be changed from the speaker portal." }, 403);
  }
  const next = {
    name: parsed.data.name ?? member.name, title: parsed.data.title ?? member.title,
    company: parsed.data.company ?? member.company, bio: parsed.data.bio ?? member.bio,
    twitter: parsed.data.twitter ?? member.twitter, linkedin: parsed.data.linkedinUrl ?? member.linkedin_url,
    dietary: parsed.data.dietaryPreferences ?? member.dietary_preferences, tshirt: parsed.data.tshirtSize ?? member.tshirt_size,
    travel: parsed.data.travelPreferences ?? member.travel_preferences, status: parsed.data.workflowStatus ?? member.workflow_status,
    note: parsed.data.organizerNote ?? member.organizer_note, headshot: parsed.data.headshotUrl ?? member.headshot_url,
  };
  const versionRow = await context.env.DB.prepare(
    "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM content_versions WHERE entity_type = 'speaker' AND entity_id = ?",
  ).bind(speakerId).first<{ version: number }>();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO content_versions
       (id, event_id, entity_type, entity_id, version, snapshot_json, editor_id, change_summary)
       VALUES (?, ?, 'speaker', ?, ?, ?, ?, 'Speaker profile updated')`,
    ).bind(createId("ver"), session.eventId, speakerId, versionRow?.version ?? 1, JSON.stringify(member), session.userId),
    context.env.DB.prepare(
      `UPDATE users SET name = ?, title = ?, company = ?, bio = ?, twitter = ?, linkedin_url = ?,
       dietary_preferences = ?, tshirt_size = ?, travel_preferences = ?, workflow_status = ?, organizer_note = ?,
       headshot_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(next.name, next.title, next.company, next.bio, next.twitter, next.linkedin, next.dietary,
      next.tshirt, next.travel, next.status, next.note, next.headshot, speakerId),
  ]);
  return context.json({ ok: true, message: "Speaker profile saved and versioned." });
});

speakers.post("/import", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can import speakers." }, 403);
  const form = await context.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return context.json({ error: "Choose a CSV file." }, 400);
  const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift() ?? "").map((header) => header.trim().toLowerCase());
  const required = ["name", "email", "title", "company", "bio"];
  if (!required.every((key) => headers.includes(key))) return context.json({ error: "CSV must include name, email, title, company, and bio." }, 400);
  let imported = 0;
  for (const line of lines) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
    if (!row.email || !row.name) continue;
    let user = await context.env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").bind(row.email).first<{ id: string }>();
    const userId = user?.id ?? createId("usr");
    await context.env.DB.batch([
      user ? context.env.DB.prepare(
        "UPDATE users SET name = ?, title = ?, company = ?, bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(row.name, row.title, row.company, row.bio, userId) : context.env.DB.prepare(
        "INSERT INTO users (id, email, name, title, company, bio) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(userId, row.email, row.name, row.title, row.company, row.bio),
      context.env.DB.prepare(
        "INSERT OR IGNORE INTO event_members (event_id, user_id, role, status) VALUES (?, ?, 'speaker', 'active')",
      ).bind(session.eventId, userId),
    ]);
    imported += 1;
  }
  return context.json({ ok: true, imported, message: `${imported} speaker records imported and mapped.` });
});

speakers.post("/tasks", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can assign speaker tasks." }, 403);
  const parsed = z.object({ speakerIds: z.array(z.string()).min(1), sessionId: z.string().nullable().optional(),
    title: z.string().min(3), description: z.string().default(""), dueAt: z.string(),
    taskType: z.enum(["action", "file_request"]).default("action"), acceptedTypes: z.string().optional(),
    maxFileBytes: z.number().int().positive().optional() }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Choose speakers and provide a task, due date, and instructions." }, 400);
  await context.env.DB.batch(parsed.data.speakerIds.map((speakerId) => context.env.DB.prepare(
    `INSERT INTO speaker_tasks
     (id, event_id, session_id, speaker_id, title, description, due_at, task_type, accepted_types, max_file_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(createId("tsk"), session.eventId, parsed.data.sessionId ?? null, speakerId, parsed.data.title,
    parsed.data.description, parsed.data.dueAt, parsed.data.taskType, parsed.data.acceptedTypes ?? null,
    parsed.data.maxFileBytes ?? null)));
  return context.json({ ok: true, assigned: parsed.data.speakerIds.length, message: `Task assigned to ${parsed.data.speakerIds.length} speaker${parsed.data.speakerIds.length === 1 ? "" : "s"}.` });
});

speakers.post("/tasks/:taskId/complete", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const result = await context.env.DB.prepare(
    `UPDATE speaker_tasks SET status = 'complete', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND event_id = ? AND (? = 1 OR speaker_id = ?)`,
  ).bind(context.req.param("taskId"), session.eventId, isOrganizer(session) ? 1 : 0, session.userId).run();
  return result.meta.changes ? context.json({ ok: true, message: "Task marked complete." }) : context.json({ error: "Task not found." }, 404);
});

speakers.post("/tasks/:taskId/upload", async (context) => {
  const session = await requireSession(context);
  if (!session || session.role !== "speaker") return context.json({ error: "Use a speaker account to upload this deliverable." }, 403);
  const task = await context.env.DB.prepare(
    "SELECT * FROM speaker_tasks WHERE id = ? AND event_id = ? AND speaker_id = ? AND task_type = 'file_request'",
  ).bind(context.req.param("taskId"), session.eventId, session.userId).first<Record<string, string | number | null>>();
  if (!task) return context.json({ error: "File request not found." }, 404);
  const form = await context.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return context.json({ error: "Choose a file to upload." }, 400);
  if (task.max_file_bytes && file.size > Number(task.max_file_bytes)) return context.json({ error: "The file exceeds this request's size limit." }, 413);
  const version = await context.env.DB.prepare(
    "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM deliverable_files WHERE task_id = ?",
  ).bind(task.id).first<{ version: number }>();
  await context.env.DB.batch([
    context.env.DB.prepare("UPDATE deliverable_files SET is_latest = 0 WHERE task_id = ?").bind(task.id),
    context.env.DB.prepare(
      `INSERT INTO deliverable_files
       (id, task_id, session_id, speaker_id, file_name, mime_type, size_bytes, version, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(createId("fil"), task.id, task.session_id, session.userId, file.name,
      file.type || "application/octet-stream", file.size, version?.version ?? 1, await file.arrayBuffer()),
    context.env.DB.prepare(
      "UPDATE speaker_tasks SET status = 'submitted', deliverable_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(`/api/speakers/tasks/${task.id}/latest`, task.id),
  ]);
  return context.json({ ok: true, version: version?.version ?? 1, message: "File uploaded; previous versions remain available." });
});

speakers.get("/files/latest.zip", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can bulk-download deliverables." }, 403);
  const files = await context.env.DB.prepare(
    `SELECT deliverable_files.file_name, deliverable_files.data, users.name AS speaker_name, speaker_tasks.title AS task_title
     FROM deliverable_files JOIN speaker_tasks ON speaker_tasks.id = deliverable_files.task_id
     JOIN users ON users.id = deliverable_files.speaker_id
     WHERE speaker_tasks.event_id = ? AND deliverable_files.is_latest = 1`,
  ).bind(session.eventId).all<{ file_name: string; data: ArrayBuffer | null; speaker_name: string; task_title: string }>();
  const entries: Record<string, Uint8Array> = {};
  for (const file of files.results) {
    const folder = file.speaker_name.replace(/[^a-z0-9 -]/gi, "").trim();
    entries[`${folder}/${file.file_name}`] = file.data ? new Uint8Array(file.data) : strToU8(`Metadata-only record for ${file.task_title}`);
  }
  const archive = zipSync(entries, { level: 6 });
  return new Response(archive, { headers: { "content-type": "application/zip",
    "content-disposition": "attachment; filename=program-desk-latest-deliverables.zip" } });
});

speakers.get("/files/:fileId", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const file = await context.env.DB.prepare(
    `SELECT deliverable_files.* FROM deliverable_files JOIN speaker_tasks ON speaker_tasks.id = deliverable_files.task_id
     WHERE deliverable_files.id = ? AND speaker_tasks.event_id = ? AND (? = 1 OR deliverable_files.speaker_id = ?)`,
  ).bind(context.req.param("fileId"), session.eventId, isOrganizer(session) ? 1 : 0, session.userId)
    .first<{ file_name: string; mime_type: string; data: ArrayBuffer }>();
  if (!file) return context.json({ error: "File not found." }, 404);
  return new Response(file.data, { headers: { "content-type": file.mime_type,
    "content-disposition": `attachment; filename="${file.file_name.replaceAll('"', "")}"` } });
});

speakers.post("/files/:fileId/comments", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const parsed = z.object({ body: z.string().min(2).max(2000) }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Add a comment." }, 400);
  const file = await context.env.DB.prepare(
    `SELECT deliverable_files.id, deliverable_files.speaker_id FROM deliverable_files
     JOIN speaker_tasks ON speaker_tasks.id = deliverable_files.task_id
     WHERE deliverable_files.id = ? AND speaker_tasks.event_id = ?`,
  ).bind(context.req.param("fileId"), session.eventId).first<{ id: string; speaker_id: string }>();
  if (!file || (!isOrganizer(session) && file.speaker_id !== session.userId)) return context.json({ error: "File not found." }, 404);
  await context.env.DB.prepare("INSERT INTO deliverable_comments (id, file_id, author_id, body) VALUES (?, ?, ?, ?)")
    .bind(createId("fcm"), file.id, session.userId, parsed.data.body).run();
  return context.json({ ok: true, message: "Comment added with author and timestamp." });
});

speakers.post("/remind", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can send task reminders." }, 403);
  const rows = await context.env.DB.prepare(
    `SELECT users.id, users.email, users.name, speaker_tasks.title, speaker_tasks.due_at
     FROM speaker_tasks JOIN users ON users.id = speaker_tasks.speaker_id
     WHERE speaker_tasks.event_id = ? AND speaker_tasks.status != 'complete'`,
  ).bind(session.eventId).all<{ id: string; email: string; name: string; title: string; due_at: string | null }>();
  const bySpeaker = new Map<string, { email: string; name: string; tasks: string[] }>();
  for (const row of rows.results) {
    const record = bySpeaker.get(row.id) ?? { email: row.email, name: row.name, tasks: [] };
    record.tasks.push(`${row.title}${row.due_at ? ` (due ${row.due_at})` : ""}`);
    bySpeaker.set(row.id, record);
  }
  const reminders = [...bySpeaker.values()];
  if (reminders.length) await context.env.DB.batch(reminders.map((speaker) => context.env.DB.prepare(
    `INSERT INTO communications (id, event_id, related_type, sender_id, recipient_email, subject, body, status, sent_at)
     VALUES (?, ?, 'speaker_task_reminder', ?, ?, ?, ?, 'sent', CURRENT_TIMESTAMP)`,
  ).bind(createId("com"), session.eventId, session.userId, speaker.email, `${session.eventName}: speaker tasks due`,
    `Hi ${speaker.name}, these speaker tasks are outstanding: ${speaker.tasks.join("; ")}.`)));
  return context.json({ ok: true, sent: reminders.length, message: `${reminders.length} reminder${reminders.length === 1 ? "" : "s"} logged.` });
});

speakers.post("/bulk-email", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can email speakers." }, 403);
  const parsed = z.object({ speakerIds: z.array(z.string()).min(1), subject: z.string().min(3), body: z.string().min(3) })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Choose speakers and add a subject and body." }, 400);
  const placeholders = parsed.data.speakerIds.map(() => "?").join(",");
  // Recipients must be members of the caller's event. Selecting straight from
  // users would let any id become a recipient, writing another event's people
  // into this event's outbox.
  const people = await context.env.DB.prepare(
    `SELECT users.id, users.name, users.email FROM users
     JOIN event_members ON event_members.user_id = users.id
     WHERE users.id IN (${placeholders}) AND event_members.event_id = ?`,
  ).bind(...parsed.data.speakerIds, session.eventId).all<{ id: string; name: string; email: string }>();
  if (!people.results.length) return context.json({ error: "No recipients in this event were selected." }, 400);
  await context.env.DB.batch(people.results.map((person) => context.env.DB.prepare(
    `INSERT INTO communications (id, event_id, related_type, related_id, sender_id, recipient_email, subject, body, status, sent_at)
     VALUES (?, ?, 'speaker_broadcast', ?, ?, ?, ?, ?, 'sent', CURRENT_TIMESTAMP)`,
  ).bind(createId("com"), session.eventId, person.id, session.userId, person.email,
    parsed.data.subject.replaceAll("{speaker_name}", person.name), parsed.data.body.replaceAll("{speaker_name}", person.name))));
  return context.json({ ok: true, sent: people.results.length, message: `${people.results.length} personalized messages logged.` });
});

speakers.patch("/sessions/:sessionId", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can edit session content." }, 403);
  const parsed = z.object({ title: z.string().min(3), description: z.string().min(3),
    contentStatus: z.enum(["draft", "approved"]) }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Add a title, description, and approval status." }, 400);
  const current = await context.env.DB.prepare("SELECT * FROM sessions WHERE id = ? AND event_id = ?")
    .bind(context.req.param("sessionId"), session.eventId).first<Record<string, unknown>>();
  if (!current) return context.json({ error: "Session not found." }, 404);
  const version = await context.env.DB.prepare(
    "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM content_versions WHERE entity_type = 'session' AND entity_id = ?",
  ).bind(context.req.param("sessionId")).first<{ version: number }>();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO content_versions
       (id, event_id, entity_type, entity_id, version, snapshot_json, editor_id, change_summary)
       VALUES (?, ?, 'session', ?, ?, ?, ?, ?)`,
    ).bind(createId("ver"), session.eventId, context.req.param("sessionId"), version?.version ?? 1,
      JSON.stringify(current), session.userId, `Session content changed to ${parsed.data.contentStatus}.`),
    context.env.DB.prepare(
      "UPDATE sessions SET title = ?, description = ?, content_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(parsed.data.title, parsed.data.description, parsed.data.contentStatus, context.req.param("sessionId")),
  ]);
  return context.json({ ok: true, message: "Session content saved and version history updated." });
});

speakers.post("/versions/:versionId/restore", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can restore content versions." }, 403);
  const version = await context.env.DB.prepare(
    "SELECT * FROM content_versions WHERE id = ? AND event_id = ?",
  ).bind(context.req.param("versionId"), session.eventId).first<Record<string, string | number | null>>();
  if (!version) return context.json({ error: "Content version not found." }, 404);
  const snapshot = JSON.parse(String(version.snapshot_json)) as Record<string, unknown>;
  if (version.entity_type === "session") {
    await context.env.DB.prepare(
      "UPDATE sessions SET title = ?, description = ?, content_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND event_id = ?",
    ).bind(snapshot.title, snapshot.description, snapshot.content_status, version.entity_id, session.eventId).run();
  } else {
    await context.env.DB.prepare(
      `UPDATE users SET name = ?, title = ?, company = ?, bio = ?, headshot_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(snapshot.name, snapshot.title, snapshot.company, snapshot.bio, snapshot.headshot_url, version.entity_id).run();
  }
  await context.env.DB.prepare(
    `INSERT INTO audit_events (id, organization_id, event_id, actor_id, action, entity_type, entity_id, summary)
     VALUES (?, ?, ?, ?, 'content.restored', ?, ?, ?)`,
  ).bind(createId("aud"), session.organizationId, session.eventId, session.userId, version.entity_type,
    version.entity_id, `Restored ${version.entity_type} version ${version.version}.`).run();
  return context.json({ ok: true, message: `Version ${version.version} restored.` });
});

export { speakers };
