import { Hono } from "hono";
import { z } from "zod";

import { isOrganizer, requireSession } from "../lib/access";
import { createId } from "../lib/crypto";
import { deliverCommunication, getEmailProvider, maskKey } from "../services/email";
import type { AppEnv } from "../types";

const publishing = new Hono<AppEnv>();

publishing.get("/", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can manage publishing." }, 403);
  const [event, domains, form, fields, tracks, formats, templates, communications, embeds, audit] = await Promise.all([
    context.env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(session.eventId).first(),
    context.env.DB.prepare("SELECT * FROM approved_domains WHERE organization_id = ? ORDER BY domain")
      .bind(session.organizationId).all(),
    context.env.DB.prepare("SELECT * FROM cfp_forms WHERE event_id = ? ORDER BY created_at LIMIT 1").bind(session.eventId).first(),
    context.env.DB.prepare(
      `SELECT cfp_fields.* FROM cfp_fields JOIN cfp_forms ON cfp_forms.id = cfp_fields.form_id
       WHERE cfp_forms.event_id = ? ORDER BY cfp_fields.sort_order`,
    ).bind(session.eventId).all(),
    context.env.DB.prepare("SELECT * FROM tracks WHERE event_id = ? ORDER BY sort_order").bind(session.eventId).all(),
    context.env.DB.prepare("SELECT * FROM session_formats WHERE event_id = ? ORDER BY sort_order").bind(session.eventId).all(),
    context.env.DB.prepare("SELECT * FROM communication_templates WHERE event_id = ? ORDER BY name").bind(session.eventId).all(),
    context.env.DB.prepare("SELECT * FROM communications WHERE event_id = ? ORDER BY created_at DESC LIMIT 100").bind(session.eventId).all(),
    context.env.DB.prepare("SELECT * FROM public_embeds WHERE event_id = ? ORDER BY widget_type").bind(session.eventId).all(),
    context.env.DB.prepare(
      `SELECT audit_events.*, users.name AS actor_name FROM audit_events LEFT JOIN users ON users.id = audit_events.actor_id
       WHERE audit_events.event_id = ? ORDER BY audit_events.created_at DESC LIMIT 100`,
    ).bind(session.eventId).all(),
  ]);
  return context.json({ event, domains: domains.results, form, fields: fields.results, tracks: tracks.results,
    formats: formats.results, templates: templates.results, communications: communications.results,
    embeds: embeds.results, audit: audit.results });
});

publishing.patch("/event", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can update event settings." }, 403);
  const parsed = z.object({ name: z.string().min(3).optional(), tagline: z.string().optional(), description: z.string().optional(),
    location: z.string().optional(), startsOn: z.string().optional(), endsOn: z.string().optional(),
    defaultSessionMinutes: z.number().int().min(5).max(480).optional(), advisorName: z.string().optional(),
    advisorPersona: z.string().optional(), advisorInstructions: z.string().optional() })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "The event settings are invalid." }, 400);
  const current = await context.env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(session.eventId).first<Record<string, unknown>>();
  if (!current) return context.json({ error: "Event not found." }, 404);
  await context.env.DB.prepare(
    `UPDATE events SET name = ?, tagline = ?, description = ?, location = ?, starts_on = ?, ends_on = ?,
      default_session_minutes = ?, advisor_name = ?, advisor_persona = ?, advisor_instructions = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).bind(parsed.data.name ?? current.name, parsed.data.tagline ?? current.tagline,
    parsed.data.description ?? current.description, parsed.data.location ?? current.location,
    parsed.data.startsOn ?? current.starts_on, parsed.data.endsOn ?? current.ends_on,
    parsed.data.defaultSessionMinutes ?? current.default_session_minutes,
    parsed.data.advisorName ?? current.advisor_name, parsed.data.advisorPersona ?? current.advisor_persona,
    parsed.data.advisorInstructions ?? current.advisor_instructions, session.eventId).run();
  return context.json({ ok: true, message: "Event and AI advisor settings saved." });
});

publishing.post("/domains", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can add approved company domains." }, 403);
  const parsed = z.object({ domain: z.string().min(3).regex(/^[a-z0-9.-]+$/i) }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Enter a valid company email domain." }, 400);
  await context.env.DB.prepare(
    "INSERT OR IGNORE INTO approved_domains (id, organization_id, domain) VALUES (?, ?, ?)",
  ).bind(createId("dom"), session.organizationId, parsed.data.domain.toLowerCase()).run();
  return context.json({ ok: true, message: "Approved company domain added." });
});

publishing.patch("/cfp", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can configure the CFP." }, 403);
  const parsed = z.object({ status: z.enum(["draft", "published", "closed"]).optional(), redirectUrl: z.string().optional(),
    opensAt: z.string().nullable().optional(), closesAt: z.string().nullable().optional() })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "The submission window is invalid." }, 400);
  const form = await context.env.DB.prepare("SELECT * FROM cfp_forms WHERE event_id = ? ORDER BY created_at LIMIT 1")
    .bind(session.eventId).first<Record<string, unknown>>();
  if (!form) return context.json({ error: "CFP form not found." }, 404);
  await context.env.DB.prepare(
    `UPDATE cfp_forms SET status = ?, redirect_url = ?, opens_at = ?, closes_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).bind(parsed.data.status ?? form.status, parsed.data.redirectUrl ?? form.redirect_url,
    parsed.data.opensAt === undefined ? form.opens_at : parsed.data.opensAt,
    parsed.data.closesAt === undefined ? form.closes_at : parsed.data.closesAt, form.id).run();
  return context.json({ ok: true, publicUrl: `/events/${session.eventSlug}/cfp`, message: "Submission form settings saved." });
});

publishing.post("/cfp/fields", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can edit the submission form." }, 403);
  const parsed = z.object({ label: z.string().min(2), fieldType: z.enum(["short_text", "long_text", "number", "select", "multi_select", "file"]),
    required: z.boolean().default(false), options: z.array(z.string()).default([]), helpText: z.string().default(""),
    conditionFieldKey: z.string().nullable().default(null), conditionValue: z.string().nullable().default(null) })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success || (parsed.data.fieldType.includes("select") && !parsed.data.options.length)) {
    return context.json({ error: "Add a label, field type, and dropdown options when required." }, 400);
  }
  const form = await context.env.DB.prepare("SELECT id FROM cfp_forms WHERE event_id = ? ORDER BY created_at LIMIT 1")
    .bind(session.eventId).first<{ id: string }>();
  if (!form) return context.json({ error: "CFP form not found." }, 404);
  const key = parsed.data.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  await context.env.DB.prepare(
    `INSERT INTO cfp_fields
     (id, form_id, field_key, label, field_type, help_text, required, options_json, sort_order, condition_field_key, condition_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM cfp_fields WHERE form_id = ?), ?, ?)`,
  ).bind(createId("fld"), form.id, key, parsed.data.label, parsed.data.fieldType, parsed.data.helpText,
    parsed.data.required ? 1 : 0, parsed.data.options.length ? JSON.stringify(parsed.data.options) : null,
    form.id, parsed.data.conditionFieldKey, parsed.data.conditionValue).run();
  return context.json({ ok: true, message: "Form field added and available on the public portal." });
});

publishing.patch("/templates/:templateId", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can edit email templates." }, 403);
  const parsed = z.object({ subject: z.string().min(2), body: z.string().min(2), enabled: z.boolean(),
    deliveryMode: z.enum(["immediate", "daily_digest", "off", "manual"]) })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Add a subject, body, and delivery mode." }, 400);
  await context.env.DB.prepare(
    `UPDATE communication_templates SET subject = ?, body = ?, enabled = ?, delivery_mode = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND event_id = ?`,
  ).bind(parsed.data.subject, parsed.data.body, parsed.data.enabled ? 1 : 0, parsed.data.deliveryMode,
    context.req.param("templateId"), session.eventId).run();
  return context.json({ ok: true, message: "Email template saved; preview now uses this copy." });
});

publishing.post("/embeds", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can generate embeds." }, 403);
  const parsed = z.object({ widgetType: z.enum(["sessions", "speakers", "agenda", "itinerary", "speaker_gallery"]),
    name: z.string().min(2), outputFormat: z.enum(["script", "iframe", "url", "json", "ical"]),
    config: z.record(z.string(), z.unknown()).default({}) }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Choose a widget, name, and output format." }, 400);
  const token = crypto.randomUUID().replaceAll("-", "");
  const id = createId("emb");
  await context.env.DB.prepare(
    `INSERT INTO public_embeds (id, event_id, name, widget_type, output_format, config_json, public_token)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, session.eventId, parsed.data.name, parsed.data.widgetType, parsed.data.outputFormat,
    JSON.stringify(parsed.data.config), token).run();
  return context.json({ ok: true, id, snippet: `<iframe src="/events/${session.eventSlug}/${parsed.data.widgetType}?embed=${token}" title="${parsed.data.name}"></iframe>`,
    feedUrl: `/api/public/${session.eventSlug}/feed/${parsed.data.widgetType}?token=${token}` });
});

publishing.get("/email-provider", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can view email settings." }, 403);
  const config = await getEmailProvider(context.env.DB, session.eventId);
  // The key itself never leaves the server; a masked tail is enough to recognize
  // which key is connected.
  return context.json(config
    ? { configured: true, provider: config.provider, fromAddress: config.from_address, keyPreview: maskKey(config.api_key) }
    : { configured: false });
});

publishing.put("/email-provider", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can change email settings." }, 403);
  const parsed = z.object({ provider: z.literal("resend"), fromAddress: z.string().email(), apiKey: z.string().min(8) })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Provide a from address and a Resend API key." }, 400);
  await context.env.DB.prepare(
    `INSERT INTO event_email_providers (event_id, provider, from_address, api_key) VALUES (?, 'resend', ?, ?)
     ON CONFLICT(event_id) DO UPDATE SET provider = 'resend', from_address = excluded.from_address,
       api_key = excluded.api_key, updated_at = CURRENT_TIMESTAMP`,
  ).bind(session.eventId, parsed.data.fromAddress, parsed.data.apiKey).run();
  return context.json({ ok: true, message: "Email delivery connected. New speaker communications will be delivered through your provider." });
});

publishing.delete("/email-provider", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can change email settings." }, 403);
  await context.env.DB.prepare("DELETE FROM event_email_providers WHERE event_id = ?").bind(session.eventId).run();
  return context.json({ ok: true, message: "Provider disconnected. Communications return to outbox-only." });
});

publishing.post("/email-provider/test", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can send a test email." }, 403);
  const config = await getEmailProvider(context.env.DB, session.eventId);
  if (!config) return context.json({ error: "Connect a provider before sending a test." }, 409);
  // The test goes to the signed-in organizer's own address — never to an
  // arbitrary recipient — and is logged like any other communication.
  const communicationId = createId("com");
  await context.env.DB.prepare(
    `INSERT INTO communications (id, event_id, related_type, sender_id, recipient_email, subject, body, status, sent_at)
     VALUES (?, ?, 'provider_test', ?, ?, ?, ?, 'sent', CURRENT_TIMESTAMP)`,
  ).bind(communicationId, session.eventId, session.userId, session.email,
    "Event Manager OS delivery test", "This message confirms your email provider is connected and delivering.").run();
  const outcome = await deliverCommunication(context.env.DB, config, communicationId, {
    to: session.email, subject: "Event Manager OS delivery test",
    body: "This message confirms your email provider is connected and delivering.",
  });
  return outcome === "delivered"
    ? context.json({ ok: true, message: `Test delivered to ${session.email}. The receipt records the provider message id.` })
    : context.json({ error: "The provider rejected the test send. Check the key and verified from address; the failure is recorded in the outbox." }, 502);
});

publishing.patch("/embeds/:embedId", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can manage embeds." }, 403);
  const parsed = z.object({ enabled: z.boolean() }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Send an enabled state." }, 400);
  const result = await context.env.DB.prepare(
    "UPDATE public_embeds SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND event_id = ?",
  ).bind(parsed.data.enabled ? 1 : 0, context.req.param("embedId"), session.eventId).run();
  return result.meta.changes
    ? context.json({ ok: true, message: parsed.data.enabled ? "Embed enabled." : "Embed disabled; its token stops resolving." })
    : context.json({ error: "Embed not found." }, 404);
});

publishing.delete("/embeds/:embedId", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can manage embeds." }, 403);
  const result = await context.env.DB.prepare("DELETE FROM public_embeds WHERE id = ? AND event_id = ?")
    .bind(context.req.param("embedId"), session.eventId).run();
  return result.meta.changes ? context.json({ ok: true, message: "Embed deleted." }) : context.json({ error: "Embed not found." }, 404);
});

export { publishing };
