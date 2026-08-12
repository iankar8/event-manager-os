import type { Context } from "hono";

import type { AppEnv, SessionContext } from "../types";
import { getSession } from "./session";

export function isOrganizer(session: SessionContext) {
  return session.role === "owner" || session.role === "admin" || session.role === "organizer";
}

export async function requireSession(context: Context<AppEnv>) {
  const session = await getSession(context);
  if (!session) return null;
  return session;
}

export async function canReadProposal(
  db: D1Database,
  session: SessionContext,
  proposalId: string,
) {
  if (isOrganizer(session)) {
    return Boolean(await db.prepare("SELECT id FROM proposals WHERE id = ? AND event_id = ?")
      .bind(proposalId, session.eventId).first());
  }

  if (session.role === "reviewer") {
    return Boolean(await db.prepare(
      `SELECT proposals.id FROM proposals
       JOIN review_assignments ON review_assignments.proposal_id = proposals.id
       JOIN review_rounds ON review_rounds.id = review_assignments.round_id
       JOIN review_plans ON review_plans.id = review_rounds.plan_id
       WHERE proposals.id = ? AND review_plans.event_id = ? AND review_assignments.reviewer_id = ?`,
    ).bind(proposalId, session.eventId, session.userId).first());
  }

  return Boolean(await db.prepare(
    `SELECT proposals.id FROM proposals
     LEFT JOIN proposal_participants ON proposal_participants.proposal_id = proposals.id
     WHERE proposals.id = ? AND proposals.event_id = ?
       AND (proposals.submitter_id = ? OR proposal_participants.user_id = ?)`,
  ).bind(proposalId, session.eventId, session.userId, session.userId).first());
}
