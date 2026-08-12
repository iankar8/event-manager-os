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

export { workspaceContext };
