import { Hono } from "hono";
import { z } from "zod";

import { isOrganizer, requireSession } from "../lib/access";
import { createId } from "../lib/crypto";
import {
  AcceleventsClient,
  buildAcceleventsPlan,
  mapAcceleventsRecords,
  type SourceSession,
  type SourceSpeaker,
  type StoredSyncRecord,
} from "../services/accelevents";
import type { AppEnv } from "../types";

const integrations = new Hono<AppEnv>();

function deliveryMode(env: AppEnv["Bindings"]) {
  return env.ACCELEVENTS_SYNC_MODE === "live" ? "live" : "outbox";
}

function summarize(items: { action: string; status?: string }[]) {
  return {
    creates: items.filter((item) => item.action === "create").length,
    updates: items.filter((item) => item.action === "update").length,
    skips: items.filter((item) => item.action === "skip").length,
    warnings: items.filter((item) => item.action === "warning").length,
    applied: items.filter((item) => item.status === "applied").length,
    failed: items.filter((item) => item.status === "failed").length,
  };
}

async function sourceRecords(db: D1Database, eventId: string, sessionTypeFormat: "IN_PERSON" | "VIRTUAL" | "HYBRID") {
  const revision = await db.prepare(
    "SELECT id FROM schedule_revisions WHERE event_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1",
  ).bind(eventId).first<{ id: string }>();
  if (!revision) return null;
  const [event, sessions, speakers] = await Promise.all([
    db.prepare("SELECT timezone FROM events WHERE id = ?").bind(eventId).first<{ timezone: string }>(),
    db.prepare(
      `SELECT sessions.id, sessions.title, sessions.description, schedule_items.starts_at, schedule_items.ends_at,
              rooms.name AS room_name, session_formats.name AS format_name,
              GROUP_CONCAT(session_participants.user_id, ',') AS speaker_ids
       FROM schedule_items
       JOIN sessions ON sessions.id = schedule_items.session_id
       JOIN rooms ON rooms.id = schedule_items.room_id
       LEFT JOIN session_formats ON session_formats.id = sessions.format_id
       LEFT JOIN session_participants ON session_participants.session_id = sessions.id
       WHERE schedule_items.revision_id = ? AND sessions.event_id = ? AND sessions.content_status = 'approved'
       GROUP BY sessions.id
       ORDER BY schedule_items.starts_at, rooms.sort_order, sessions.title`,
    ).bind(revision.id, eventId).all<SourceSession>(),
    db.prepare(
      `SELECT DISTINCT users.id, users.name, users.email, users.title, users.company, users.bio,
              users.headshot_url, users.twitter
       FROM schedule_items
       JOIN sessions ON sessions.id = schedule_items.session_id
       JOIN session_participants ON session_participants.session_id = sessions.id
       JOIN users ON users.id = session_participants.user_id
       WHERE schedule_items.revision_id = ? AND sessions.event_id = ? AND sessions.content_status = 'approved'
       ORDER BY users.email`,
    ).bind(revision.id, eventId).all<SourceSpeaker>(),
  ]);
  return {
    revisionId: revision.id,
    records: mapAcceleventsRecords({
      speakers: speakers.results,
      sessions: sessions.results,
      timezone: event?.timezone ?? "UTC",
      sessionTypeFormat,
    }),
  };
}

integrations.get("/accelevents", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can manage integrations." }, 403);
  const [connection, runs] = await Promise.all([
    context.env.DB.prepare(
      "SELECT * FROM integration_connections WHERE event_id = ? AND provider = 'accelevents'",
    ).bind(session.eventId).first(),
    context.env.DB.prepare(
      `SELECT integration_runs.*, users.name AS approved_by_name
       FROM integration_runs LEFT JOIN users ON users.id = integration_runs.approved_by
       WHERE integration_runs.event_id = ? AND integration_runs.provider = 'accelevents'
       ORDER BY integration_runs.created_at DESC, integration_runs.rowid DESC LIMIT 20`,
    ).bind(session.eventId).all(),
  ]);
  return context.json({
    connection,
    runs: runs.results,
    deliveryMode: deliveryMode(context.env),
    credentialsConfigured: Boolean(context.env.ACCELEVENTS_API_KEY),
  });
});

integrations.put("/accelevents/connection", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can connect Accelevents." }, 403);
  const parsed = z.object({
    eventUrl: z.string().min(2).max(120).regex(/^[a-z0-9][a-z0-9-]*$/i),
    eventId: z.union([z.string().min(1), z.number().int().positive()]).optional(),
    sessionTypeFormat: z.enum(["IN_PERSON", "VIRTUAL", "HYBRID"]).default("IN_PERSON"),
  }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Add the Accelevents event URL slug and event format." }, 400);
  const existing = await context.env.DB.prepare(
    "SELECT * FROM integration_connections WHERE event_id = ? AND provider = 'accelevents'",
  ).bind(session.eventId).first<Record<string, string>>();
  if (existing && existing.external_event_url !== parsed.data.eventUrl) {
    const records = await context.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM integration_records WHERE event_id = ? AND provider = 'accelevents'",
    ).bind(session.eventId).first<{ count: number }>();
    if (records?.count) return context.json({ error: "This connection has sync receipts. Disconnecting or changing the target requires an explicit reconciliation step." }, 409);
  }
  const id = existing?.id ?? createId("int");
  await context.env.DB.prepare(
    `INSERT INTO integration_connections
       (id, event_id, provider, external_event_url, external_event_id, session_type_format, created_by)
     VALUES (?, ?, 'accelevents', ?, ?, ?, ?)
     ON CONFLICT(event_id, provider) DO UPDATE SET external_event_url = excluded.external_event_url,
       external_event_id = excluded.external_event_id, session_type_format = excluded.session_type_format,
       status = 'active', updated_at = CURRENT_TIMESTAMP`,
  ).bind(id, session.eventId, parsed.data.eventUrl, parsed.data.eventId ? String(parsed.data.eventId) : null,
    parsed.data.sessionTypeFormat, session.userId).run();
  return context.json({ ok: true, connectionId: id, credentialsConfigured: Boolean(context.env.ACCELEVENTS_API_KEY),
    message: "Accelevents target saved. Preview remains mutation-free." });
});

integrations.post("/accelevents/preview", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can preview a sync." }, 403);
  const connection = await context.env.DB.prepare(
    "SELECT * FROM integration_connections WHERE event_id = ? AND provider = 'accelevents' AND status = 'active'",
  ).bind(session.eventId).first<{ id: string; session_type_format: "IN_PERSON" | "VIRTUAL" | "HYBRID" }>();
  if (!connection) return context.json({ error: "Connect an Accelevents event before previewing." }, 409);
  const source = await sourceRecords(context.env.DB, session.eventId, connection.session_type_format);
  if (!source) return context.json({ error: "Publish a schedule revision before creating a sync preview." }, 409);
  const mode = deliveryMode(context.env);
  const stored = await context.env.DB.prepare(
    `SELECT * FROM integration_records
     WHERE event_id = ? AND provider = 'accelevents' AND delivery_mode = ?`,
  ).bind(session.eventId, mode).all<StoredSyncRecord>();
  const plan = await buildAcceleventsPlan(source.records, stored.results);
  const runId = createId("run");
  const summary = summarize(plan);
  const statements = [
    context.env.DB.prepare(
      `INSERT INTO integration_runs
       (id, connection_id, event_id, provider, source_revision_id, delivery_mode, status, summary_json)
       VALUES (?, ?, ?, 'accelevents', ?, ?, 'previewed', ?)`,
    ).bind(runId, connection.id, session.eventId, source.revisionId, mode, JSON.stringify(summary)),
    ...plan.map((item) => context.env.DB.prepare(
      `INSERT INTO integration_run_items
       (id, run_id, record_type, source_id, external_id, action, status, payload_json, diff_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(createId("itm"), runId, item.recordType, item.sourceId, item.externalId, item.action,
      item.action === "warning" ? "warning" : "previewed", JSON.stringify(item.payload),
      JSON.stringify({ fields: item.diff, unsupportedFields: item.unsupportedFields, payloadHash: item.payloadHash }))),
  ];
  await context.env.DB.batch(statements);
  return context.json({ ok: true, runId, deliveryMode: mode, summary, items: plan,
    message: "Preview created. Nothing was sent to Accelevents." }, 201);
});

integrations.post("/accelevents/runs/:runId/apply", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can approve a sync." }, 403);
  const parsed = z.object({ confirm: z.literal(true) }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Explicit confirmation is required before applying this preview." }, 400);
  const run = await context.env.DB.prepare(
    `SELECT integration_runs.*, integration_connections.external_event_url
     FROM integration_runs JOIN integration_connections ON integration_connections.id = integration_runs.connection_id
     WHERE integration_runs.id = ? AND integration_runs.event_id = ? AND integration_runs.provider = 'accelevents'`,
  ).bind(context.req.param("runId"), session.eventId).first<Record<string, string>>();
  if (!run) return context.json({ error: "Sync preview not found for this event." }, 404);
  if (run.status === "completed") return context.json({ error: "This preview was already applied." }, 409);
  const mode = run.delivery_mode as "outbox" | "live";
  if (mode === "live" && !context.env.ACCELEVENTS_API_KEY) {
    return context.json({ error: "The Accelevents API secret is not configured." }, 409);
  }
  const client = mode === "live" ? new AcceleventsClient(run.external_event_url, context.env.ACCELEVENTS_API_KEY!) : null;
  await context.env.DB.prepare(
    `UPDATE integration_runs SET status = 'running', approved_by = COALESCE(approved_by, ?),
       approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP) WHERE id = ?`,
  ).bind(session.userId, run.id).run();
  const result = await context.env.DB.prepare(
    `SELECT * FROM integration_run_items WHERE run_id = ?
     ORDER BY CASE record_type WHEN 'speaker' THEN 1 ELSE 2 END, created_at`,
  ).bind(run.id).all<Record<string, string>>();
  for (const item of result.results) {
    if (item.status === "applied" || item.action === "skip" || item.action === "warning") {
      if (item.status === "previewed") await context.env.DB.prepare(
        "UPDATE integration_run_items SET status = 'skipped', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(item.id).run();
      continue;
    }
    try {
      const payload = JSON.parse(item.payload_json) as Record<string, unknown>;
      const externalId = client
        ? item.action === "create"
          ? await client.create(item.record_type as "speaker" | "session", payload)
          : await client.update(item.record_type as "speaker" | "session", item.external_id, payload)
        : item.external_id || `outbox_${item.record_type}_${item.source_id}`;
      const metadata = JSON.parse(item.diff_json) as { payloadHash: string };
      await context.env.DB.batch([
        context.env.DB.prepare(
          `INSERT INTO integration_records
           (id, event_id, provider, delivery_mode, record_type, source_id, external_id, payload_hash, payload_json, last_run_id)
           VALUES (?, ?, 'accelevents', ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(event_id, provider, delivery_mode, record_type, source_id) DO UPDATE SET
             external_id = excluded.external_id, payload_hash = excluded.payload_hash,
             payload_json = excluded.payload_json, last_run_id = excluded.last_run_id,
             last_synced_at = CURRENT_TIMESTAMP`,
        ).bind(createId("map"), session.eventId, mode, item.record_type, item.source_id, externalId,
          metadata.payloadHash, item.payload_json, run.id),
        context.env.DB.prepare(
          "UPDATE integration_run_items SET external_id = ?, status = 'applied', error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(externalId, item.id),
      ]);
    } catch (error) {
      await context.env.DB.prepare(
        "UPDATE integration_run_items SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(error instanceof Error ? error.message : "Unknown Accelevents failure", item.id).run();
    }
  }
  const finalItems = await context.env.DB.prepare("SELECT action, status FROM integration_run_items WHERE run_id = ?")
    .bind(run.id).all<{ action: string; status: string }>();
  const summary = summarize(finalItems.results);
  const finalStatus = summary.failed ? (summary.applied ? "partial" : "failed") : "completed";
  await context.env.DB.batch([
    context.env.DB.prepare(
      "UPDATE integration_runs SET status = ?, summary_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(finalStatus, JSON.stringify(summary), run.id),
    context.env.DB.prepare(
      `INSERT INTO audit_events
       (id, organization_id, event_id, actor_id, action, entity_type, entity_id, summary, metadata_json)
       VALUES (?, ?, ?, ?, ?, 'integration_run', ?, ?, ?)`,
    ).bind(createId("aud"), session.organizationId, session.eventId, session.userId,
      finalStatus === "completed" ? "integration.accelevents.completed" : "integration.accelevents.failed",
      run.id, mode === "live" ? "Applied approved records to Accelevents." : "Recorded an Accelevents outbox simulation; no external mutation occurred.",
      JSON.stringify(summary)),
  ]);
  return context.json({ ok: finalStatus === "completed", runId: run.id, status: finalStatus, deliveryMode: mode, summary,
    message: mode === "live" ? "Approved changes were applied to Accelevents." : "Outbox simulation completed; no external mutation occurred." });
});

export { integrations };
