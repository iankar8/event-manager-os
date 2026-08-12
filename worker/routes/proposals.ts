import { Hono } from "hono";
import { z } from "zod";

import { canReadProposal, isOrganizer, requireSession } from "../lib/access";
import { createId, createToken, hashToken } from "../lib/crypto";
import type { AppEnv } from "../types";

const proposals = new Hono<AppEnv>();

const proposalInput = z.object({
  title: z.string().min(3),
  abstract: z.string().default(""),
  trackId: z.string().nullable().optional(),
  formatId: z.string().nullable().optional(),
  audienceLevel: z.string().optional(),
  notesForReviewers: z.string().optional(),
  keyTakeaway: z.string().optional(),
  workshopPrerequisites: z.string().optional(),
  status: z.enum(["draft", "submitted"]).default("draft"),
});
const decisionInput = z.object({
  disposition: z.enum(["accepted", "rejected", "waitlisted", "changes_requested"]),
  rationale: z.string().max(2000).default(""),
  notify: z.boolean().default(true),
});

function scopeSql(role: string) {
  if (["owner", "admin", "organizer"].includes(role)) return { clause: "", args: [] as string[] };
  if (role === "reviewer") {
    return {
      clause: `AND EXISTS (SELECT 1 FROM review_assignments ra
        JOIN review_rounds rr ON rr.id = ra.round_id JOIN review_plans rp ON rp.id = rr.plan_id
        WHERE ra.proposal_id = proposals.id AND ra.reviewer_id = ? AND rp.event_id = proposals.event_id)`,
      args: ["user"],
    };
  }
  return {
    clause: `AND (proposals.submitter_id = ? OR EXISTS
      (SELECT 1 FROM proposal_participants pp WHERE pp.proposal_id = proposals.id AND pp.user_id = ?))`,
    args: ["user", "user"],
  };
}

proposals.get("/", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const scope = scopeSql(session.role);
  const args = [session.eventId, ...scope.args.map(() => session.userId)];
  const rows = await context.env.DB.prepare(
    `SELECT proposals.id, proposals.title, proposals.abstract, proposals.audience_level,
            proposals.key_takeaway, proposals.status, proposals.submitted_at, proposals.updated_at,
            tracks.id AS track_id, tracks.name AS track_name, session_formats.id AS format_id,
            session_formats.name AS format_name, users.name AS submitter_name,
            ROUND(AVG(reviews.aggregate_score), 2) AS aggregate_score,
            ai_recommendations.disposition AS ai_disposition,
            ai_recommendations.confidence AS ai_confidence,
            COUNT(DISTINCT review_assignments.id) AS assignment_count,
            COUNT(DISTINCT CASE WHEN review_assignments.status = 'submitted' THEN review_assignments.id END) AS completed_reviews
     FROM proposals
     JOIN users ON users.id = proposals.submitter_id
     LEFT JOIN tracks ON tracks.id = proposals.track_id
     LEFT JOIN session_formats ON session_formats.id = proposals.format_id
     LEFT JOIN review_assignments ON review_assignments.proposal_id = proposals.id
     LEFT JOIN reviews ON reviews.assignment_id = review_assignments.id AND reviews.status = 'submitted'
     LEFT JOIN ai_recommendations ON ai_recommendations.proposal_id = proposals.id
     WHERE proposals.event_id = ? ${scope.clause}
     GROUP BY proposals.id ORDER BY proposals.updated_at DESC`,
  ).bind(...args).all();
  return context.json({ proposals: rows.results });
});

proposals.get("/export.csv", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  if (!isOrganizer(session)) return context.json({ error: "Only organizers can export review results." }, 403);
  const rows = await context.env.DB.prepare(
    `SELECT proposals.title, proposals.status, tracks.name AS track, session_formats.name AS format,
            users.name AS speaker, ROUND(AVG(reviews.aggregate_score), 2) AS aggregate_score,
            MAX(CASE WHEN scorecard_criteria.label = 'Originality' THEN review_values.numeric_value END) AS originality,
            MAX(CASE WHEN scorecard_criteria.label = 'Relevance' THEN review_values.numeric_value END) AS relevance,
            MAX(CASE WHEN scorecard_criteria.label = 'Recommendation' THEN trim(review_values.value_json, '"') END) AS recommendation,
            CASE WHEN COUNT(DISTINCT CASE WHEN review_assignments.status = 'submitted' THEN review_assignments.id END) > 0
              THEN 'reviewed' ELSE 'pending' END AS review_status
     FROM proposals JOIN users ON users.id = proposals.submitter_id
     LEFT JOIN tracks ON tracks.id = proposals.track_id
     LEFT JOIN session_formats ON session_formats.id = proposals.format_id
     LEFT JOIN review_assignments ON review_assignments.proposal_id = proposals.id
     LEFT JOIN reviews ON reviews.assignment_id = review_assignments.id AND reviews.status = 'submitted'
     LEFT JOIN review_values ON review_values.review_id = reviews.id
     LEFT JOIN scorecard_criteria ON scorecard_criteria.id = review_values.criterion_id
     WHERE proposals.event_id = ? GROUP BY proposals.id ORDER BY aggregate_score DESC`,
  ).bind(session.eventId).all<Record<string, string | number | null>>();
  const headers = ["title", "status", "track", "format", "speaker", "aggregate_score", "originality", "relevance", "recommendation", "review_status"];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.join(","), ...rows.results.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=review-results.csv" } });
});

proposals.get("/:proposalId", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const proposalId = context.req.param("proposalId");
  if (!(await canReadProposal(context.env.DB, session, proposalId))) return context.json({ error: "Proposal not found." }, 404);

  const [proposal, participants, answers, assignments, reviewValues, research, ai, decisions] = await Promise.all([
    context.env.DB.prepare(
      `SELECT proposals.*, tracks.name AS track_name, session_formats.name AS format_name,
              users.name AS submitter_name, users.email AS submitter_email, users.bio AS speaker_bio,
              cfp_forms.closes_at AS cfp_closes_at
       FROM proposals JOIN users ON users.id = proposals.submitter_id
       LEFT JOIN tracks ON tracks.id = proposals.track_id
       LEFT JOIN session_formats ON session_formats.id = proposals.format_id
       LEFT JOIN cfp_forms ON cfp_forms.event_id = proposals.event_id
       WHERE proposals.id = ? AND proposals.event_id = ?`,
    ).bind(proposalId, session.eventId).first(),
    context.env.DB.prepare(
      `SELECT users.id, users.name, users.title, users.company, proposal_participants.role_label,
              proposal_participants.is_primary
       FROM proposal_participants JOIN users ON users.id = proposal_participants.user_id
       WHERE proposal_participants.proposal_id = ? ORDER BY proposal_participants.sort_order`,
    ).bind(proposalId).all(),
    context.env.DB.prepare(
      `SELECT cfp_fields.id AS field_id, cfp_fields.field_key, cfp_fields.label, proposal_answers.value_json
       FROM proposal_answers JOIN cfp_fields ON cfp_fields.id = proposal_answers.field_id
       WHERE proposal_answers.proposal_id = ? ORDER BY cfp_fields.sort_order`,
    ).bind(proposalId).all(),
    context.env.DB.prepare(
      `SELECT review_assignments.id, review_assignments.status, review_assignments.assignment_reason,
              review_rounds.name AS round_name, users.name AS reviewer_name,
              reviews.aggregate_score, reviews.status AS review_status, reviews.submitted_at
       FROM review_assignments JOIN review_rounds ON review_rounds.id = review_assignments.round_id
       JOIN users ON users.id = review_assignments.reviewer_id
       LEFT JOIN reviews ON reviews.assignment_id = review_assignments.id
       WHERE review_assignments.proposal_id = ? AND (? = 1 OR review_assignments.reviewer_id = ?)`,
    ).bind(proposalId, isOrganizer(session) ? 1 : 0, session.userId).all(),
    context.env.DB.prepare(
      `SELECT review_assignments.id AS assignment_id, review_values.criterion_id, scorecard_criteria.label,
              review_values.value_json, review_values.numeric_value
       FROM review_values JOIN reviews ON reviews.id = review_values.review_id
       JOIN review_assignments ON review_assignments.id = reviews.assignment_id
       JOIN scorecard_criteria ON scorecard_criteria.id = review_values.criterion_id
       WHERE review_assignments.proposal_id = ? AND (? = 1 OR review_assignments.reviewer_id = ?)
       ORDER BY scorecard_criteria.sort_order`,
    ).bind(proposalId, isOrganizer(session) ? 1 : 0, session.userId).all(),
    context.env.DB.prepare("SELECT * FROM research_briefs WHERE proposal_id = ?").bind(proposalId).first(),
    context.env.DB.prepare("SELECT * FROM ai_recommendations WHERE proposal_id = ? ORDER BY updated_at DESC LIMIT 1").bind(proposalId).first(),
    context.env.DB.prepare(
      `SELECT decisions.*, users.name AS decided_by_name FROM decisions
       JOIN users ON users.id = decisions.decided_by WHERE proposal_id = ? ORDER BY decided_at DESC`,
    ).bind(proposalId).all(),
  ]);
  return context.json({ proposal, participants: participants.results, answers: answers.results, assignments: assignments.results,
    reviewValues: reviewValues.results, research, ai, decisions: decisions.results });
});

proposals.post("/", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  if (session.role === "reviewer") return context.json({ error: "Reviewers cannot submit proposals." }, 403);
  const parsed = proposalInput.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Add a title and complete all required proposal fields." }, 400);
  if (parsed.data.status === "submitted" && (!parsed.data.abstract || !parsed.data.trackId || !parsed.data.formatId || !parsed.data.keyTakeaway)) {
    return context.json({ error: "Abstract, track, format, and Key takeaway are required before submission." }, 400);
  }
  const proposalId = createId("pro");
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO proposals
       (id, event_id, submitter_id, title, abstract, track_id, format_id, audience_level,
        notes_for_reviewers, key_takeaway, workshop_prerequisites, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
    ).bind(proposalId, session.eventId, session.userId, parsed.data.title, parsed.data.abstract,
      parsed.data.trackId ?? null, parsed.data.formatId ?? null, parsed.data.audienceLevel ?? null,
      parsed.data.notesForReviewers ?? null, parsed.data.keyTakeaway ?? null,
      parsed.data.workshopPrerequisites ?? null, parsed.data.status, parsed.data.status),
    context.env.DB.prepare(
      "INSERT INTO proposal_participants (proposal_id, user_id, role_label, is_primary, sort_order) VALUES (?, ?, 'Primary speaker', 1, 1)",
    ).bind(proposalId, session.userId),
  ]);
  return context.json({ ok: true, proposalId, message: parsed.data.status === "draft" ? "Draft saved." : "Proposal submitted. A confirmation email has been queued." }, 201);
});

proposals.patch("/:proposalId", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const proposalId = context.req.param("proposalId");
  if (!(await canReadProposal(context.env.DB, session, proposalId))) return context.json({ error: "Proposal not found." }, 404);
  const parsed = proposalInput.partial().safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "The proposal update is invalid." }, 400);
  if (!isOrganizer(session)) {
    const form = await context.env.DB.prepare("SELECT closes_at FROM cfp_forms WHERE event_id = ? ORDER BY created_at LIMIT 1")
      .bind(session.eventId).first<{ closes_at: string | null }>();
    if (form?.closes_at && new Date(form.closes_at).getTime() < Date.now()) return context.json({ error: "Editing is closed because the CFP deadline has passed." }, 409);
  }
  const current = await context.env.DB.prepare("SELECT * FROM proposals WHERE id = ?").bind(proposalId).first<Record<string, unknown>>();
  const value = {
    ...current,
    title: parsed.data.title ?? current?.title,
    abstract: parsed.data.abstract ?? current?.abstract,
    track_id: parsed.data.trackId === undefined ? current?.track_id : parsed.data.trackId,
    format_id: parsed.data.formatId === undefined ? current?.format_id : parsed.data.formatId,
    audience_level: parsed.data.audienceLevel ?? current?.audience_level,
    notes_for_reviewers: parsed.data.notesForReviewers ?? current?.notes_for_reviewers,
    key_takeaway: parsed.data.keyTakeaway ?? current?.key_takeaway,
    workshop_prerequisites: parsed.data.workshopPrerequisites ?? current?.workshop_prerequisites,
  };
  await context.env.DB.prepare(
    `UPDATE proposals SET title = ?, abstract = ?, track_id = ?, format_id = ?, audience_level = ?,
      notes_for_reviewers = ?, key_takeaway = ?, workshop_prerequisites = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).bind(value.title, value.abstract, value.track_id, value.format_id, value.audience_level,
    value.notes_for_reviewers, value.key_takeaway, value.workshop_prerequisites, proposalId).run();
  return context.json({ ok: true, message: "Proposal changes saved." });
});

proposals.post("/:proposalId/decision", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  if (!isOrganizer(session)) return context.json({ error: "Only organizers can record decisions." }, 403);
  const parsed = decisionInput.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Choose a valid decision." }, 400);
  const proposalId = context.req.param("proposalId");
  const proposal = await context.env.DB.prepare(
    `SELECT proposals.*, users.email, users.name AS speaker_name FROM proposals
     JOIN users ON users.id = proposals.submitter_id WHERE proposals.id = ? AND proposals.event_id = ?`,
  ).bind(proposalId, session.eventId).first<Record<string, string>>();
  if (!proposal) return context.json({ error: "Proposal not found." }, 404);
  const statements = [
    context.env.DB.prepare("UPDATE proposals SET status = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(parsed.data.disposition, proposalId),
    context.env.DB.prepare("INSERT INTO decisions (id, proposal_id, disposition, decided_by, rationale) VALUES (?, ?, ?, ?, ?)")
      .bind(createId("dec"), proposalId, parsed.data.disposition, session.userId, parsed.data.rationale),
  ];
  if (parsed.data.disposition === "accepted") {
    const sessionId = createId("ssn");
    statements.push(
      context.env.DB.prepare(
        `INSERT OR IGNORE INTO sessions
         (id, event_id, proposal_id, title, description, track_id, format_id, source_type, content_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'proposal', 'draft')`,
      ).bind(sessionId, session.eventId, proposalId, proposal.title, proposal.abstract, proposal.track_id, proposal.format_id),
      context.env.DB.prepare(
        `INSERT OR IGNORE INTO session_participants (session_id, user_id, role_label, sort_order)
         SELECT sessions.id, proposal_participants.user_id, proposal_participants.role_label, proposal_participants.sort_order
         FROM sessions JOIN proposal_participants ON proposal_participants.proposal_id = sessions.proposal_id
         WHERE sessions.proposal_id = ?`,
      ).bind(proposalId),
    );
    const onboardingTasks = [
      { title: "Confirm participation", description: "Confirm that you will participate in the accepted session.", offset: "-75 days", type: "action", acceptedTypes: null, maxFileBytes: null },
      { title: "Upload headshot", description: "Provide a high-resolution speaker headshot for the public program.", offset: "-60 days", type: "file_request", acceptedTypes: ".jpg,.jpeg,.png,.webp", maxFileBytes: 10_485_760 },
      { title: "Complete bio and profile", description: "Review your name, title, company, bio, and social links.", offset: "-60 days", type: "action", acceptedTypes: null, maxFileBytes: null },
      { title: "Sign speaker release form", description: "Complete the event speaker release.", offset: "-45 days", type: "action", acceptedTypes: null, maxFileBytes: null },
      { title: "Upload final slides", description: "Upload the final deck for the production team.", offset: "-14 days", type: "file_request", acceptedTypes: ".pdf,.ppt,.pptx", maxFileBytes: 26_214_400 },
    ];
    for (const task of onboardingTasks) {
      statements.push(context.env.DB.prepare(
        `INSERT INTO speaker_tasks
         (id, event_id, session_id, speaker_id, title, description, due_at, task_type, accepted_types, max_file_bytes)
         SELECT 'tsk_' || lower(hex(randomblob(16))), sessions.event_id, sessions.id, proposal_participants.user_id, ?, ?,
                date(events.starts_on, ?), ?, ?, ?
         FROM sessions
         JOIN events ON events.id = sessions.event_id
         JOIN proposal_participants ON proposal_participants.proposal_id = sessions.proposal_id
         WHERE sessions.proposal_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM speaker_tasks
             WHERE speaker_tasks.session_id = sessions.id
               AND speaker_tasks.speaker_id = proposal_participants.user_id
               AND speaker_tasks.title = ?
           )`,
      ).bind(task.title, task.description, task.offset, task.type,
        task.acceptedTypes, task.maxFileBytes, proposalId, task.title));
    }
  }
  if (parsed.data.notify) {
    const subject = parsed.data.disposition === "accepted" ? `Your talk has been accepted to ${session.eventName}` : `An update on your ${session.eventName} proposal`;
    const body = parsed.data.disposition === "accepted"
      ? `Hi ${proposal.speaker_name}, congratulations! Your session '${proposal.title}' has been accepted. Please confirm your participation and complete your speaker profile.`
      : `Hi ${proposal.speaker_name}, thank you for submitting '${proposal.title}'. We are unable to include it in this year's program.`;
    statements.push(context.env.DB.prepare(
      `INSERT INTO communications
       (id, event_id, related_type, related_id, sender_id, recipient_email, subject, body, status, sent_at)
       VALUES (?, ?, 'decision', ?, ?, ?, ?, ?, 'sent', CURRENT_TIMESTAMP)`,
    ).bind(createId("com"), session.eventId, proposalId, session.userId, proposal.email, subject, body));
  }
  await context.env.DB.batch(statements);
  return context.json({ ok: true, message: `${parsed.data.disposition.replace("_", " ")} recorded${parsed.data.notify ? " and notification logged" : ""}.` });
});

proposals.post("/:proposalId/share", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can create external shares." }, 403);
  const proposalId = context.req.param("proposalId");
  const body = z.object({ email: z.string().email(), canComment: z.boolean().default(true) })
    .safeParse(await context.req.json().catch(() => null));
  if (!body.success) return context.json({ error: "Enter a valid recipient email." }, 400);
  const token = createToken();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  await context.env.DB.prepare(
    `INSERT INTO external_shares
     (id, event_id, resource_type, resource_id, recipient_email, token_hash, can_comment, expires_at, created_by)
     VALUES (?, ?, 'proposal', ?, ?, ?, ?, ?, ?)`,
  ).bind(createId("shr"), session.eventId, proposalId, body.data.email, await hashToken(token), body.data.canComment ? 1 : 0, expiresAt, session.userId).run();
  return context.json({ ok: true, url: `/share/${token}`, expiresAt });
});

export { proposals };
