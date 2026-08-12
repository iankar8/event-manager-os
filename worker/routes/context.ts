import { Hono } from "hono";

import { getSession } from "../lib/session";
import type { AppEnv, Role } from "../types";

const workspaceContext = new Hono<AppEnv>();

workspaceContext.get("/", async (context) => {
  const session = await getSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);

  const organizer = session.role === "owner" || session.role === "admin" || session.role === "organizer";
  const proposalSql = organizer
    ? `SELECT status, COUNT(*) AS count FROM proposals WHERE event_id = ? GROUP BY status`
    : session.role === "reviewer"
      ? `SELECT proposals.status, COUNT(DISTINCT proposals.id) AS count FROM proposals
         JOIN review_assignments ON review_assignments.proposal_id = proposals.id
         JOIN review_rounds ON review_rounds.id = review_assignments.round_id
         JOIN review_plans ON review_plans.id = review_rounds.plan_id
         WHERE review_plans.event_id = ? AND review_assignments.reviewer_id = ? GROUP BY proposals.status`
      : `SELECT proposals.status, COUNT(DISTINCT proposals.id) AS count FROM proposals
         LEFT JOIN proposal_participants ON proposal_participants.proposal_id = proposals.id
         WHERE proposals.event_id = ? AND (proposals.submitter_id = ? OR proposal_participants.user_id = ?)
         GROUP BY proposals.status`;
  const reviewSql = organizer
    ? `SELECT review_assignments.status, COUNT(*) AS count
       FROM review_assignments JOIN review_rounds ON review_rounds.id = review_assignments.round_id
       JOIN review_plans ON review_plans.id = review_rounds.plan_id
       WHERE review_plans.event_id = ? GROUP BY review_assignments.status`
    : session.role === "reviewer"
      ? `SELECT review_assignments.status, COUNT(*) AS count
         FROM review_assignments JOIN review_rounds ON review_rounds.id = review_assignments.round_id
         JOIN review_plans ON review_plans.id = review_rounds.plan_id
         WHERE review_plans.event_id = ? AND review_assignments.reviewer_id = ? GROUP BY review_assignments.status`
      : `SELECT 'submitted' AS status, COUNT(*) AS count FROM reviews
         JOIN review_assignments ON review_assignments.id = reviews.assignment_id
         JOIN proposals ON proposals.id = review_assignments.proposal_id
         LEFT JOIN proposal_participants ON proposal_participants.proposal_id = proposals.id
         WHERE proposals.event_id = ? AND (proposals.submitter_id = ? OR proposal_participants.user_id = ?)`;
  const taskSql = organizer
    ? `SELECT status, COUNT(*) AS count FROM speaker_tasks WHERE event_id = ? GROUP BY status`
    : `SELECT status, COUNT(*) AS count FROM speaker_tasks WHERE event_id = ? AND speaker_id = ? GROUP BY status`;
  const sessionsSql = organizer
    ? "SELECT COUNT(*) AS count FROM sessions WHERE event_id = ?"
    : session.role === "speaker"
      ? `SELECT COUNT(DISTINCT sessions.id) AS count FROM sessions
         JOIN session_participants ON session_participants.session_id = sessions.id
         WHERE sessions.event_id = ? AND session_participants.user_id = ?`
      : `SELECT COUNT(DISTINCT sessions.id) AS count FROM sessions
         JOIN proposals ON proposals.id = sessions.proposal_id
         JOIN review_assignments ON review_assignments.proposal_id = proposals.id
         WHERE sessions.event_id = ? AND review_assignments.reviewer_id = ?`;

  const proposalArgs = organizer ? [session.eventId] : session.role === "reviewer"
    ? [session.eventId, session.userId] : [session.eventId, session.userId, session.userId];
  const reviewArgs = organizer ? [session.eventId] : session.role === "reviewer"
    ? [session.eventId, session.userId] : [session.eventId, session.userId, session.userId];
  const userScopedArgs = organizer ? [session.eventId] : [session.eventId, session.userId];

  const [proposalCounts, reviewCounts, taskCounts, sessionCounts, personas] = await Promise.all([
    context.env.DB.prepare(proposalSql).bind(...proposalArgs).all<{ status: string; count: number }>(),
    context.env.DB.prepare(reviewSql).bind(...reviewArgs).all<{ status: string; count: number }>(),
    context.env.DB.prepare(taskSql).bind(...userScopedArgs).all<{ status: string; count: number }>(),
    context.env.DB.prepare(sessionsSql).bind(...userScopedArgs)
      .first<{ count: number }>(),
    session.isDemo
      ? context.env.DB.prepare(
          `SELECT event_members.role, users.name
           FROM event_members JOIN users ON users.id = event_members.user_id
           WHERE event_members.event_id = ? AND event_members.role IN ('organizer', 'reviewer', 'speaker')
           ORDER BY CASE event_members.role WHEN 'organizer' THEN 1 WHEN 'reviewer' THEN 2 ELSE 3 END`,
        ).bind(session.eventId).all<{ role: Role; name: string }>()
      : Promise.resolve({ results: [] as { role: Role; name: string }[] }),
  ]);

  return context.json({
    session,
    summary: {
      proposals: proposalCounts.results,
      reviews: reviewCounts.results,
      tasks: taskCounts.results,
      sessions: sessionCounts?.count ?? 0,
    },
    personas: personas.results,
  });
});

/**
 * Event-scoped lifecycle trace for one canonical program record.
 *
 * Every field returned here is read back out of a persisted row. Where a stage has
 * no evidence, it is returned incomplete rather than filled in — the point of the
 * trace is that a reader can open the record behind each claim, so a fabricated
 * actor or receipt would defeat it entirely.
 */
workspaceContext.get("/trace", async (context) => {
  const session = await getSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const organizer = session.role === "owner" || session.role === "admin" || session.role === "organizer";
  if (!organizer) return context.json({ error: "Only organizers can read the program record trace." }, 403);

  // The event is taken from the session, never from the client, so the trace can
  // not be pointed at another organization's event by editing a request.
  const eventId = session.eventId;

  const canonical = await context.env.DB.prepare(
    `SELECT proposals.id AS proposal_id, proposals.title, proposals.submitted_at, proposals.decided_at,
            tracks.name AS track_name, submitter.name AS submitter_name,
            sessions.id AS session_id, sessions.content_status,
            schedule_items.id AS item_id, schedule_items.starts_at, schedule_items.ends_at,
            rooms.name AS room_name,
            revision.id AS revision_id, revision.version AS revision_version,
            revision.published_at, revision.created_at AS revision_created_at,
            publisher.name AS publisher_name, creator.name AS revision_creator_name
     FROM proposals
     JOIN users submitter ON submitter.id = proposals.submitter_id
     JOIN sessions ON sessions.proposal_id = proposals.id
     JOIN schedule_items ON schedule_items.session_id = sessions.id
     JOIN schedule_revisions revision ON revision.id = schedule_items.revision_id AND revision.status = 'published'
     LEFT JOIN tracks ON tracks.id = proposals.track_id
     LEFT JOIN rooms ON rooms.id = schedule_items.room_id
     LEFT JOIN users publisher ON publisher.id = revision.published_by
     LEFT JOIN users creator ON creator.id = revision.created_by
     WHERE proposals.event_id = ? AND sessions.event_id = ? AND revision.event_id = ?
     ORDER BY revision.published_at DESC, revision.version DESC
     LIMIT 1`,
  ).bind(eventId, eventId, eventId).first<Record<string, string | number | null>>();

  if (!canonical) {
    return context.json({
      trace: null,
      reason: "No proposal in this event has reached a published schedule revision yet.",
    });
  }

  const proposalId = String(canonical.proposal_id);
  const sessionId = String(canonical.session_id);

  const [review, decision, taskRollup, contentVersion] = await Promise.all([
    context.env.DB.prepare(
      `SELECT reviews.id AS review_id, reviews.submitted_at, reviews.aggregate_score,
              reviewer.name AS reviewer_name, review_rounds.name AS round_name
       FROM reviews
       JOIN review_assignments ON review_assignments.id = reviews.assignment_id
       JOIN review_rounds ON review_rounds.id = review_assignments.round_id
       JOIN review_plans ON review_plans.id = review_rounds.plan_id
       JOIN users reviewer ON reviewer.id = reviews.reviewer_id
       WHERE review_assignments.proposal_id = ? AND reviews.status = 'submitted' AND review_plans.event_id = ?
       ORDER BY reviews.submitted_at
       LIMIT 1`,
    ).bind(proposalId, eventId).first<Record<string, string | number | null>>(),
    context.env.DB.prepare(
      `SELECT decisions.id AS decision_id, decisions.disposition, decisions.decided_at, decider.name AS decider_name
       FROM decisions
       JOIN proposals ON proposals.id = decisions.proposal_id
       JOIN users decider ON decider.id = decisions.decided_by
       WHERE decisions.proposal_id = ? AND proposals.event_id = ?
       ORDER BY decisions.decided_at DESC
       LIMIT 1`,
    ).bind(proposalId, eventId).first<Record<string, string | number | null>>(),
    context.env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS complete,
              MAX(CASE WHEN status = 'complete' THEN completed_at END) AS last_completed_at,
              MIN(CASE WHEN status <> 'complete' THEN title END) AS next_open_title
       FROM speaker_tasks
       WHERE session_id = ? AND event_id = ?`,
    ).bind(sessionId, eventId).first<Record<string, string | number | null>>(),
    context.env.DB.prepare(
      `SELECT content_versions.id AS version_id, content_versions.version, content_versions.created_at,
              content_versions.change_summary, editor.name AS editor_name
       FROM content_versions
       LEFT JOIN users editor ON editor.id = content_versions.editor_id
       WHERE content_versions.entity_type = 'session' AND content_versions.entity_id = ?
         AND content_versions.event_id = ?
       ORDER BY content_versions.version DESC
       LIMIT 1`,
    ).bind(sessionId, eventId).first<Record<string, string | number | null>>(),
  ]);

  const totalTasks = Number(taskRollup?.total ?? 0);
  const completeTasks = Number(taskRollup?.complete ?? 0);
  const contentApproved = canonical.content_status === "approved";
  const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

  const stages = [
    {
      key: "submitted",
      label: "Submitted",
      complete: Boolean(canonical.submitted_at),
      actorName: text(canonical.submitter_name),
      actorRole: "Speaker",
      occurredAt: text(canonical.submitted_at),
      evidence: "The proposal record carries the submitted title, abstract, track, and format exactly as entered.",
      rule: "Every proposal belongs to one event; the public form writes only into the event that owns the call.",
      receiptType: "proposals",
      receiptId: proposalId,
      destination: "Proposal record",
      section: "proposals",
    },
    {
      key: "reviewed",
      label: "Reviewed",
      complete: Boolean(review?.review_id),
      actorName: text(review?.reviewer_name),
      actorRole: review?.review_id ? "Reviewer" : null,
      occurredAt: text(review?.submitted_at),
      evidence: review?.review_id
        ? `Scorecard submitted in ${text(review.round_name)} with a weighted score of ${text(review.aggregate_score)}.`
        : "No submitted review is attached to this proposal.",
      rule: "A reviewer can read and score only the proposals assigned to them; every other proposal returns not-found.",
      receiptType: review?.review_id ? "reviews" : null,
      receiptId: text(review?.review_id),
      destination: "Review plans",
      section: "reviews",
    },
    {
      key: "accepted",
      label: "Accepted",
      complete: Boolean(decision?.decision_id),
      actorName: text(decision?.decider_name),
      actorRole: decision?.decision_id ? "Organizer" : null,
      occurredAt: text(decision?.decided_at ?? canonical.decided_at),
      evidence: decision?.decision_id
        ? `Human decision recorded as "${text(decision.disposition)}" with a written rationale.`
        : "No decision row exists for this proposal.",
      rule: "AI advice is advisory only. A decision requires a human actor; the record cannot be written without one.",
      receiptType: decision?.decision_id ? "decisions" : null,
      receiptId: text(decision?.decision_id),
      destination: "Proposal decision",
      section: "proposals",
    },
    {
      key: "onboarding",
      label: "Onboarding",
      // Recorded means the handoff happened and left evidence, not that nothing
      // remains. Outstanding work is named in the evidence line instead of
      // erasing a stage that demonstrably took place.
      complete: totalTasks > 0 && completeTasks > 0,
      actorName: text(canonical.submitter_name),
      actorRole: "Speaker",
      occurredAt: text(taskRollup?.last_completed_at),
      evidence: totalTasks
        ? `${completeTasks} of ${totalTasks} speaker tasks complete${taskRollup?.next_open_title ? `; "${text(taskRollup.next_open_title)}" is still open.` : "."}`
        : "No speaker tasks exist for this session.",
      rule: "Acceptance creates onboarding tasks for each session participant; task state is owned by the speaker.",
      receiptType: "sessions",
      receiptId: sessionId,
      destination: "Deliverables",
      section: "tasks",
    },
    {
      key: "approved",
      label: "Approved",
      complete: contentApproved,
      actorName: text(contentVersion?.editor_name),
      actorRole: contentVersion?.version_id ? "Organizer" : null,
      occurredAt: text(contentVersion?.created_at),
      evidence: contentVersion?.version_id
        ? `Content version ${text(contentVersion.version)} — ${text(contentVersion.change_summary)}`
        : contentApproved
          ? "Session content is marked approved, but no content version records who approved it."
          : "Session content has not been approved.",
      rule: "Public surfaces read only sessions whose content status is approved; unapproved copy never reaches the agenda, embeds, JSON, or ICS.",
      receiptType: contentVersion?.version_id ? "content_versions" : null,
      receiptId: text(contentVersion?.version_id),
      destination: "Content & sessions",
      section: "content",
    },
    {
      key: "scheduled",
      label: "Scheduled",
      complete: Boolean(canonical.item_id),
      actorName: text(canonical.revision_creator_name),
      actorRole: canonical.item_id ? "Organizer" : null,
      occurredAt: text(canonical.revision_created_at),
      evidence: canonical.item_id
        ? `Placed in ${text(canonical.room_name)} from ${text(canonical.starts_at)} to ${text(canonical.ends_at)}.`
        : "This session has no placement in a schedule revision.",
      rule: "Room and speaker collisions return a conflict and are refused unless an organizer supplies a written override.",
      receiptType: canonical.item_id ? "schedule_items" : null,
      receiptId: text(canonical.item_id),
      destination: "Schedule workbench",
      section: "schedule",
    },
    {
      key: "published",
      label: "Published",
      complete: Boolean(canonical.published_at),
      actorName: text(canonical.publisher_name),
      actorRole: canonical.published_at ? "Organizer" : null,
      occurredAt: text(canonical.published_at),
      evidence: canonical.published_at
        ? `Revision ${text(canonical.revision_version)} published; the agenda, embeds, JSON feed, and ICS all read from it.`
        : "No published revision contains this session.",
      rule: "Draft edits stay invisible to attendees. Publication is an explicit act that swaps the canonical public revision.",
      receiptType: canonical.revision_id ? "schedule_revisions" : null,
      receiptId: text(canonical.revision_id),
      destination: "Publish & distribute",
      section: "publish",
    },
  ];

  return context.json({
    trace: {
      proposalId,
      sessionId,
      title: String(canonical.title),
      trackName: text(canonical.track_name),
      speakerName: text(canonical.submitter_name),
      completeStages: stages.filter((stage) => stage.complete).length,
      stages,
    },
  });
});

export { workspaceContext };
