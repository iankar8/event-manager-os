import { z } from "zod";

import { createId } from "../lib/crypto";

/**
 * Co-presenters named by a speaker on their own submission.
 *
 * A conference talk routinely has more than one presenter, and until this existed
 * the association could only be created from seed data or by an organizer — a
 * speaker had no way to say who they were presenting with.
 */
export const coSpeakerInput = z.array(z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
})).max(6).default([]);

export type CoSpeaker = z.infer<typeof coSpeakerInput>[number];

/**
 * Resolves each co-presenter to a user in this event and returns the statements
 * that attach them to the proposal.
 *
 * An address that already belongs to someone is linked rather than duplicated, so
 * a returning speaker keeps one identity across proposals and events. An unknown
 * address becomes a passwordless speaker record: they can be invited through the
 * existing magic-link flow, and no password is ever set on someone else's behalf.
 * The submitter is skipped — they are already the primary participant.
 */
export async function attachCoSpeakers(
  db: D1Database,
  input: { eventId: string; proposalId: string; submitterId: string; coSpeakers: CoSpeaker[] },
): Promise<D1PreparedStatement[]> {
  const statements: D1PreparedStatement[] = [];
  const seen = new Set<string>();
  let sortOrder = 2;

  for (const coSpeaker of input.coSpeakers) {
    const email = coSpeaker.email.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);

    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
    let userId = existing?.id;

    if (!userId) {
      userId = createId("usr");
      statements.push(
        db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)").bind(userId, email, coSpeaker.name.trim()),
      );
    }
    if (userId === input.submitterId) continue;

    statements.push(
      db.prepare("INSERT OR IGNORE INTO event_members (event_id, user_id, role, status) VALUES (?, ?, 'speaker', 'invited')")
        .bind(input.eventId, userId),
      db.prepare(
        `INSERT OR IGNORE INTO proposal_participants (proposal_id, user_id, role_label, is_primary, sort_order)
         VALUES (?, ?, 'Co-speaker', 0, ?)`,
      ).bind(input.proposalId, userId, sortOrder),
    );
    sortOrder += 1;
  }

  return statements;
}

/** Clears the co-presenters on a proposal so an edit replaces them rather than appending. */
export function clearCoSpeakers(db: D1Database, proposalId: string): D1PreparedStatement {
  return db.prepare("DELETE FROM proposal_participants WHERE proposal_id = ? AND is_primary = 0").bind(proposalId);
}
