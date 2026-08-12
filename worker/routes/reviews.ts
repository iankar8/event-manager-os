import { Hono } from "hono";
import { z } from "zod";

import { isOrganizer, requireSession } from "../lib/access";
import { createId, createToken, hashToken } from "../lib/crypto";
import type { AppEnv } from "../types";

const reviews = new Hono<AppEnv>();

reviews.get("/", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  const organizer = isOrganizer(session);
  const [plans, rounds, criteria, reviewers, poolMembers, assignments, results] = await Promise.all([
    context.env.DB.prepare("SELECT * FROM review_plans WHERE event_id = ? ORDER BY created_at")
      .bind(session.eventId).all(),
    context.env.DB.prepare(
      `SELECT review_rounds.* FROM review_rounds JOIN review_plans ON review_plans.id = review_rounds.plan_id
       WHERE review_plans.event_id = ? ORDER BY review_rounds.sort_order`,
    ).bind(session.eventId).all(),
    context.env.DB.prepare(
      `SELECT scorecard_criteria.* FROM scorecard_criteria
       JOIN review_rounds ON review_rounds.id = scorecard_criteria.round_id
       JOIN review_plans ON review_plans.id = review_rounds.plan_id
       WHERE review_plans.event_id = ? ORDER BY review_rounds.sort_order, scorecard_criteria.sort_order`,
    ).bind(session.eventId).all(),
    organizer ? context.env.DB.prepare(
      `SELECT users.id, users.name, users.email, reviewer_profiles.title, reviewer_profiles.organization,
              reviewer_profiles.topics, reviewer_profiles.max_capacity, reviewer_profiles.status,
              COUNT(DISTINCT review_assignments.id) AS assigned,
              COUNT(DISTINCT CASE WHEN review_assignments.status = 'submitted' THEN review_assignments.id END) AS completed
       FROM reviewer_profiles JOIN users ON users.id = reviewer_profiles.user_id
       LEFT JOIN review_assignments ON review_assignments.reviewer_id = users.id
       WHERE reviewer_profiles.event_id = ? GROUP BY users.id ORDER BY users.name`,
    ).bind(session.eventId).all() : context.env.DB.prepare(
      `SELECT users.id, users.name, users.email, reviewer_profiles.title, reviewer_profiles.organization,
              reviewer_profiles.topics, reviewer_profiles.max_capacity, reviewer_profiles.status
       FROM reviewer_profiles JOIN users ON users.id = reviewer_profiles.user_id
       WHERE reviewer_profiles.event_id = ? AND users.id = ?`,
    ).bind(session.eventId, session.userId).all(),
    organizer ? context.env.DB.prepare(
      `SELECT round_reviewers.round_id, round_reviewers.reviewer_id, round_reviewers.status,
              users.name AS reviewer_name
       FROM round_reviewers JOIN review_rounds ON review_rounds.id = round_reviewers.round_id
       JOIN review_plans ON review_plans.id = review_rounds.plan_id
       JOIN users ON users.id = round_reviewers.reviewer_id
       WHERE review_plans.event_id = ? ORDER BY review_rounds.sort_order, users.name`,
    ).bind(session.eventId).all() : Promise.resolve({ results: [] }),
    context.env.DB.prepare(
      `SELECT review_assignments.id, review_assignments.round_id, review_assignments.proposal_id,
              review_assignments.reviewer_id, review_assignments.status, review_assignments.expertise_score,
              review_assignments.assignment_reason, review_assignments.assigned_at,
              proposals.title, proposals.abstract, proposals.audience_level, proposals.notes_for_reviewers,
              tracks.name AS track_name, session_formats.name AS format_name,
              research_briefs.summary AS research_summary, research_briefs.sources_json AS research_sources_json,
              review_rounds.name AS round_name, review_rounds.closes_at, review_rounds.blind_review,
              users.name AS reviewer_name, submitters.name AS submitter_name,
              reviews.id AS review_id, reviews.aggregate_score
       FROM review_assignments JOIN proposals ON proposals.id = review_assignments.proposal_id
       JOIN review_rounds ON review_rounds.id = review_assignments.round_id
       JOIN review_plans ON review_plans.id = review_rounds.plan_id
       JOIN users ON users.id = review_assignments.reviewer_id
       JOIN users submitters ON submitters.id = proposals.submitter_id
       LEFT JOIN tracks ON tracks.id = proposals.track_id
       LEFT JOIN session_formats ON session_formats.id = proposals.format_id
       LEFT JOIN research_briefs ON research_briefs.proposal_id = proposals.id
       LEFT JOIN reviews ON reviews.assignment_id = review_assignments.id
       WHERE review_plans.event_id = ? AND (? = 1 OR review_assignments.reviewer_id = ?)
       ORDER BY review_rounds.sort_order, review_assignments.assigned_at`,
    ).bind(session.eventId, organizer ? 1 : 0, session.userId).all(),
    organizer ? context.env.DB.prepare(
      `SELECT proposals.id, proposals.title, proposals.status, tracks.name AS track_name,
              ROUND(AVG(reviews.aggregate_score), 2) AS aggregate_score,
              COUNT(DISTINCT review_assignments.id) AS assigned,
              COUNT(DISTINCT CASE WHEN review_assignments.status = 'submitted' THEN review_assignments.id END) AS completed,
              ai_recommendations.disposition AS ai_disposition, ai_recommendations.confidence AS ai_confidence,
              ai_recommendations.override_disposition, ai_recommendations.override_reason
       FROM proposals LEFT JOIN tracks ON tracks.id = proposals.track_id
       LEFT JOIN review_assignments ON review_assignments.proposal_id = proposals.id
       LEFT JOIN reviews ON reviews.assignment_id = review_assignments.id AND reviews.status = 'submitted'
       LEFT JOIN ai_recommendations ON ai_recommendations.proposal_id = proposals.id
       WHERE proposals.event_id = ? GROUP BY proposals.id ORDER BY aggregate_score DESC, proposals.title`,
    ).bind(session.eventId).all() : Promise.resolve({ results: [] }),
  ]);

  const safeAssignments = assignments.results.map((row) => {
    const assignment = row as Record<string, unknown>;
    if (!organizer && assignment.blind_review === 1) return { ...assignment, submitter_name: null };
    return assignment;
  });
  return context.json({ plans: plans.results, rounds: rounds.results, criteria: criteria.results,
    reviewers: reviewers.results, poolMembers: poolMembers.results, assignments: safeAssignments, results: results.results });
});

reviews.post("/profile", async (context) => {
  const session = await requireSession(context);
  if (!session) return context.json({ error: "Sign in to continue." }, 401);
  if (session.role !== "reviewer") return context.json({ error: "This onboarding form is for reviewers." }, 403);
  const parsed = z.object({ title: z.string(), organization: z.string(), topics: z.string().min(3),
    maxCapacity: z.number().int().min(1).max(500), availabilityNote: z.string().default(""),
    conflictsNote: z.string().default("") }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Add expertise and a review capacity." }, 400);
  await context.env.DB.prepare(
    `INSERT INTO reviewer_profiles
     (event_id, user_id, title, organization, topics, max_capacity, availability_note, conflicts_note, policy_accepted_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'ready')
     ON CONFLICT(event_id, user_id) DO UPDATE SET title = excluded.title, organization = excluded.organization,
       topics = excluded.topics, max_capacity = excluded.max_capacity, availability_note = excluded.availability_note,
       conflicts_note = excluded.conflicts_note, policy_accepted_at = CURRENT_TIMESTAMP, status = 'ready', updated_at = CURRENT_TIMESTAMP`,
  ).bind(session.eventId, session.userId, parsed.data.title, parsed.data.organization, parsed.data.topics,
    parsed.data.maxCapacity, parsed.data.availabilityNote, parsed.data.conflictsNote).run();
  return context.json({ ok: true, message: "Reviewer profile is ready for assignment." });
});

reviews.post("/rounds", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can add review rounds." }, 403);
  const parsed = z.object({ planId: z.string(), name: z.string().min(2), opensAt: z.string(), closesAt: z.string(),
    requiredReviews: z.number().int().min(1).max(5).default(1), blindReview: z.boolean().default(false),
    instructions: z.string().default("") }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Add a round name, dates, and review count." }, 400);
  const plan = await context.env.DB.prepare("SELECT id FROM review_plans WHERE id = ? AND event_id = ?")
    .bind(parsed.data.planId, session.eventId).first();
  if (!plan) return context.json({ error: "Evaluation plan not found." }, 404);
  const id = createId("rnd");
  await context.env.DB.prepare(
    `INSERT INTO review_rounds
     (id, plan_id, name, opens_at, closes_at, required_reviews, blind_review, instructions, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM review_rounds WHERE plan_id = ?), 'draft')`,
  ).bind(id, parsed.data.planId, parsed.data.name, parsed.data.opensAt, parsed.data.closesAt,
    parsed.data.requiredReviews, parsed.data.blindReview ? 1 : 0, parsed.data.instructions, parsed.data.planId).run();
  return context.json({ ok: true, id, message: "Independent review round added." });
});

reviews.patch("/rounds/:roundId", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can edit review rounds." }, 403);
  const parsed = z.object({ name: z.string().min(2), opensAt: z.string(), closesAt: z.string(),
    requiredReviews: z.number().int().min(1).max(5), blindReview: z.boolean(), instructions: z.string(),
    status: z.enum(["draft", "recruiting", "active", "closed"]) }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Complete the round settings." }, 400);
  await context.env.DB.prepare(
    `UPDATE review_rounds SET name = ?, opens_at = ?, closes_at = ?, required_reviews = ?, blind_review = ?,
      instructions = ?, status = ? WHERE id = ? AND plan_id IN (SELECT id FROM review_plans WHERE event_id = ?)`,
  ).bind(parsed.data.name, parsed.data.opensAt, parsed.data.closesAt, parsed.data.requiredReviews,
    parsed.data.blindReview ? 1 : 0, parsed.data.instructions, parsed.data.status,
    context.req.param("roundId"), session.eventId).run();
  return context.json({ ok: true, message: "Review round settings saved." });
});

reviews.post("/rounds/:roundId/criteria", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can edit scorecards." }, 403);
  const parsed = z.object({ label: z.string().min(2), criterionType: z.enum(["numeric", "dropdown", "long_text"]),
    required: z.boolean().default(true), weight: z.number().min(0).max(100).default(1),
    minValue: z.number().optional(), maxValue: z.number().optional(), options: z.array(z.string()).default([]) })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success || (parsed.data.criterionType === "dropdown" && !parsed.data.options.length)) {
    return context.json({ error: "Add a criterion label, type, weight, and dropdown options when needed." }, 400);
  }
  const round = await context.env.DB.prepare(
    `SELECT review_rounds.id FROM review_rounds JOIN review_plans ON review_plans.id = review_rounds.plan_id
     WHERE review_rounds.id = ? AND review_plans.event_id = ?`,
  ).bind(context.req.param("roundId"), session.eventId).first();
  if (!round) return context.json({ error: "Review round not found." }, 404);
  await context.env.DB.prepare(
    `INSERT INTO scorecard_criteria
     (id, round_id, label, criterion_type, required, weight, min_value, max_value, options_json, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM scorecard_criteria WHERE round_id = ?))`,
  ).bind(createId("crt"), context.req.param("roundId"), parsed.data.label, parsed.data.criterionType,
    parsed.data.required ? 1 : 0, parsed.data.weight, parsed.data.minValue ?? null, parsed.data.maxValue ?? null,
    parsed.data.options.length ? JSON.stringify(parsed.data.options) : null, context.req.param("roundId")).run();
  return context.json({ ok: true, message: "Scorecard criterion added and available to reviewers." });
});

reviews.post("/rounds/:roundId/reviewers", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can manage reviewer pools." }, 403);
  const parsed = z.object({ reviewerId: z.string() }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Choose a reviewer." }, 400);
  const eligible = await context.env.DB.prepare(
    `SELECT review_rounds.id FROM review_rounds JOIN review_plans ON review_plans.id = review_rounds.plan_id
     JOIN reviewer_profiles ON reviewer_profiles.event_id = review_plans.event_id
     WHERE review_rounds.id = ? AND review_plans.event_id = ? AND reviewer_profiles.user_id = ?`,
  ).bind(context.req.param("roundId"), session.eventId, parsed.data.reviewerId).first();
  if (!eligible) return context.json({ error: "Round or reviewer not found in this event." }, 404);
  await context.env.DB.prepare(
    "INSERT OR IGNORE INTO round_reviewers (round_id, reviewer_id, status) VALUES (?, ?, 'assigned')",
  ).bind(context.req.param("roundId"), parsed.data.reviewerId).run();
  return context.json({ ok: true, message: "Reviewer added only to this round's pool." });
});

reviews.post("/join-link", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can create reviewer links." }, 403);
  const parsed = z.object({ roundId: z.string(), label: z.string().default("Reviewer join link") })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Choose a review round." }, 400);
  const token = createToken();
  await context.env.DB.prepare(
    `INSERT INTO join_links (id, event_id, round_id, kind, token_hash, label, expires_at, created_by)
     VALUES (?, ?, ?, 'reviewer', ?, ?, ?, ?)`,
  ).bind(createId("jnl"), session.eventId, parsed.data.roundId, await hashToken(token), parsed.data.label,
    new Date(Date.now() + 30 * 86_400_000).toISOString(), session.userId).run();
  return context.json({ ok: true, url: `/join/reviewer/${token}` });
});

reviews.post("/assign", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can assign reviews." }, 403);
  const parsed = z.object({ roundId: z.string(), proposalId: z.string(), reviewerId: z.string() })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Choose a round, proposal, and reviewer." }, 400);
  const eligible = await context.env.DB.prepare(
    `SELECT review_rounds.id FROM review_rounds JOIN review_plans ON review_plans.id = review_rounds.plan_id
     JOIN proposals ON proposals.event_id = review_plans.event_id
     JOIN round_reviewers ON round_reviewers.round_id = review_rounds.id
     WHERE review_rounds.id = ? AND review_plans.event_id = ? AND proposals.id = ?
       AND round_reviewers.reviewer_id = ?`,
  ).bind(parsed.data.roundId, session.eventId, parsed.data.proposalId, parsed.data.reviewerId).first();
  if (!eligible) return context.json({ error: "The round, proposal, or reviewer pool does not belong to this event." }, 400);
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT OR IGNORE INTO review_assignments
       (id, round_id, proposal_id, reviewer_id, status, assignment_reason)
       VALUES (?, ?, ?, ?, 'assigned', 'Assigned manually by the program organizer.')`,
    ).bind(createId("asn"), parsed.data.roundId, parsed.data.proposalId, parsed.data.reviewerId),
    context.env.DB.prepare("UPDATE proposals SET status = 'in_review', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'submitted'")
      .bind(parsed.data.proposalId),
  ]);
  return context.json({ ok: true, message: "Review assignment saved." });
});

reviews.post("/auto-assign", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can create review plans." }, 403);
  const parsed = z.object({ roundId: z.string() }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Choose a review round." }, 400);
  const [round, proposalsResult, reviewersResult, existingResult] = await Promise.all([
    context.env.DB.prepare(
      `SELECT review_rounds.required_reviews FROM review_rounds JOIN review_plans ON review_plans.id = review_rounds.plan_id
       WHERE review_rounds.id = ? AND review_plans.event_id = ?`,
    ).bind(parsed.data.roundId, session.eventId).first<{ required_reviews: number }>(),
    context.env.DB.prepare("SELECT id, track_id FROM proposals WHERE event_id = ? AND status IN ('submitted', 'in_review')")
      .bind(session.eventId).all<{ id: string; track_id: string | null }>(),
    context.env.DB.prepare(
      `SELECT users.id, reviewer_profiles.max_capacity,
              COALESCE((SELECT COUNT(*) FROM review_assignments WHERE reviewer_id = users.id AND round_id = ?), 0) AS assigned
       FROM reviewer_profiles JOIN users ON users.id = reviewer_profiles.user_id
       JOIN round_reviewers ON round_reviewers.reviewer_id = users.id AND round_reviewers.round_id = ?
       WHERE reviewer_profiles.event_id = ? AND reviewer_profiles.status = 'ready'
       ORDER BY assigned, users.name`,
    ).bind(parsed.data.roundId, parsed.data.roundId, session.eventId).all<{ id: string; max_capacity: number; assigned: number }>(),
    context.env.DB.prepare("SELECT proposal_id, reviewer_id FROM review_assignments WHERE round_id = ?")
      .bind(parsed.data.roundId).all<{ proposal_id: string; reviewer_id: string }>(),
  ]);
  if (!round) return context.json({ error: "Review round not found." }, 404);
  const loads = new Map(reviewersResult.results.map((reviewer) => [reviewer.id, Number(reviewer.assigned)]));
  const existing = new Set(existingResult.results.map((item) => `${item.proposal_id}:${item.reviewer_id}`));
  const statements: D1PreparedStatement[] = [];
  const assignments: { proposalId: string; reviewerId: string; reason: string }[] = [];
  for (const proposal of proposalsResult.results) {
    const already = existingResult.results.filter((item) => item.proposal_id === proposal.id).length;
    for (let slot = already; slot < round.required_reviews; slot += 1) {
      const candidates = reviewersResult.results.filter((reviewer) => !existing.has(`${proposal.id}:${reviewer.id}`) && (loads.get(reviewer.id) ?? 0) < reviewer.max_capacity);
      const expertise = await Promise.all(candidates.map(async (reviewer) => ({ reviewer,
        strength: proposal.track_id ? (await context.env.DB.prepare(
          "SELECT strength FROM reviewer_expertise WHERE event_id = ? AND user_id = ? AND track_id = ?",
        ).bind(session.eventId, reviewer.id, proposal.track_id).first<{ strength: number }>())?.strength ?? 0 : 0 })));
      expertise.sort((a, b) => b.strength - a.strength || (loads.get(a.reviewer.id) ?? 0) - (loads.get(b.reviewer.id) ?? 0));
      const winner = expertise[0];
      if (!winner) break;
      const load = (loads.get(winner.reviewer.id) ?? 0) + 1;
      loads.set(winner.reviewer.id, load);
      existing.add(`${proposal.id}:${winner.reviewer.id}`);
      const reason = `Expertise ${winner.strength}/3; balanced load ${load}/${winner.reviewer.max_capacity}.`;
      statements.push(context.env.DB.prepare(
        `INSERT INTO review_assignments
         (id, round_id, proposal_id, reviewer_id, status, expertise_score, assignment_reason)
         VALUES (?, ?, ?, ?, 'assigned', ?, ?)`,
      ).bind(createId("asn"), parsed.data.roundId, proposal.id, winner.reviewer.id, winner.strength / 3, reason));
      statements.push(context.env.DB.prepare("UPDATE proposals SET status = 'in_review' WHERE id = ? AND status = 'submitted'").bind(proposal.id));
      assignments.push({ proposalId: proposal.id, reviewerId: winner.reviewer.id, reason });
    }
  }
  if (statements.length) await context.env.DB.batch(statements);
  return context.json({ ok: true, assigned: assignments.length, assignments,
    message: assignments.length ? `${assignments.length} reviews assigned by expertise, conflicts, then balanced capacity.` : "Everything eligible is already assigned." });
});

reviews.post("/assignments/:assignmentId/submit", async (context) => {
  const session = await requireSession(context);
  if (!session || session.role !== "reviewer") return context.json({ error: "Only the assigned reviewer can submit this scorecard." }, 403);
  const parsed = z.object({ values: z.array(z.object({ criterionId: z.string(), value: z.union([z.string(), z.number()]) })) })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success || !parsed.data.values.length) return context.json({ error: "Complete the scorecard before submitting." }, 400);
  const assignmentId = context.req.param("assignmentId");
  const assignment = await context.env.DB.prepare(
    "SELECT id, round_id FROM review_assignments WHERE id = ? AND reviewer_id = ?",
  ).bind(assignmentId, session.userId).first<{ id: string; round_id: string }>();
  if (!assignment) return context.json({ error: "Review assignment not found." }, 404);
  const criteria = await context.env.DB.prepare(
    "SELECT id, criterion_type, required, weight, min_value, max_value, options_json FROM scorecard_criteria WHERE round_id = ?",
  ).bind(assignment.round_id).all<{
    id: string;
    criterion_type: string;
    required: number;
    weight: number;
    min_value: number | null;
    max_value: number | null;
    options_json: string | null;
  }>();
  const valuesByCriterion = new Map(parsed.data.values.map((item) => [item.criterionId, item.value]));
  if (parsed.data.values.some((item) => !criteria.results.some((criterion) => criterion.id === item.criterionId))) {
    return context.json({ error: "The scorecard includes a criterion outside this review round." }, 400);
  }
  if (criteria.results.some((criterion) => criterion.required === 1 && !valuesByCriterion.has(criterion.id))) {
    return context.json({ error: "Complete every required scorecard criterion before submitting." }, 400);
  }
  for (const criterion of criteria.results) {
    const value = valuesByCriterion.get(criterion.id);
    if (value === undefined) continue;
    if (criterion.criterion_type === "numeric") {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)
        || (criterion.min_value !== null && numericValue < criterion.min_value)
        || (criterion.max_value !== null && numericValue > criterion.max_value)) {
        return context.json({ error: "A numeric score falls outside the configured scale." }, 400);
      }
    }
    if (criterion.criterion_type === "dropdown") {
      const options = criterion.options_json ? JSON.parse(criterion.options_json) as string[] : [];
      if (!options.includes(String(value))) return context.json({ error: "Choose a configured scorecard option." }, 400);
    }
  }
  const numeric = parsed.data.values.map((item) => ({ item, criterion: criteria.results.find((criterion) => criterion.id === item.criterionId) }))
    .filter((entry) => entry.criterion?.criterion_type === "numeric" && Number.isFinite(Number(entry.item.value)));
  const totalWeight = numeric.reduce((sum, entry) => sum + Number(entry.criterion?.weight ?? 0), 0);
  const aggregate = totalWeight ? numeric.reduce((sum, entry) => sum + Number(entry.item.value) * Number(entry.criterion?.weight ?? 0), 0) / totalWeight : null;
  const existingReview = await context.env.DB.prepare("SELECT id FROM reviews WHERE assignment_id = ?")
    .bind(assignmentId).first<{ id: string }>();
  const reviewId = existingReview?.id ?? createId("rvw");
  const statements = [
    context.env.DB.prepare(
      `INSERT INTO reviews (id, assignment_id, reviewer_id, status, aggregate_score, submitted_at)
       VALUES (?, ?, ?, 'submitted', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(assignment_id) DO UPDATE SET status = 'submitted', aggregate_score = excluded.aggregate_score,
         submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
    ).bind(reviewId, assignmentId, session.userId, aggregate),
    context.env.DB.prepare("UPDATE review_assignments SET status = 'submitted', completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(assignmentId),
  ];
  for (const item of parsed.data.values) statements.push(context.env.DB.prepare(
    `INSERT INTO review_values (review_id, criterion_id, value_json, numeric_value) VALUES (?, ?, ?, ?)
     ON CONFLICT(review_id, criterion_id) DO UPDATE SET value_json = excluded.value_json, numeric_value = excluded.numeric_value`,
  ).bind(reviewId, item.criterionId, JSON.stringify(item.value), typeof item.value === "number" ? item.value : null));
  await context.env.DB.batch(statements);
  return context.json({ ok: true, aggregateScore: aggregate, message: "Review submitted and progress updated." });
});

reviews.post("/assignments/:assignmentId/recuse", async (context) => {
  const session = await requireSession(context);
  if (!session || session.role !== "reviewer") return context.json({ error: "Only reviewers can declare a conflict." }, 403);
  const parsed = z.object({ reason: z.string().min(3) }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Add a short conflict note." }, 400);
  const result = await context.env.DB.prepare(
    "UPDATE review_assignments SET status = 'recused', assignment_reason = ? WHERE id = ? AND reviewer_id = ?",
  ).bind(`Reviewer conflict: ${parsed.data.reason}`, context.req.param("assignmentId"), session.userId).run();
  return result.meta.changes ? context.json({ ok: true, message: "Conflict recorded; the organizer can reassign this proposal." })
    : context.json({ error: "Review assignment not found." }, 404);
});

reviews.post("/remind", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can send reviewer reminders." }, 403);
  const outstanding = await context.env.DB.prepare(
    `SELECT DISTINCT users.email, users.name FROM review_assignments JOIN users ON users.id = review_assignments.reviewer_id
     JOIN review_rounds ON review_rounds.id = review_assignments.round_id JOIN review_plans ON review_plans.id = review_rounds.plan_id
     WHERE review_plans.event_id = ? AND review_assignments.status IN ('assigned', 'in_progress')`,
  ).bind(session.eventId).all<{ email: string; name: string }>();
  if (outstanding.results.length) await context.env.DB.batch(outstanding.results.map((reviewer) => context.env.DB.prepare(
    `INSERT INTO communications (id, event_id, related_type, sender_id, recipient_email, subject, body, status, sent_at)
     VALUES (?, ?, 'review_reminder', ?, ?, ?, ?, 'sent', CURRENT_TIMESTAMP)`,
  ).bind(createId("com"), session.eventId, session.userId, reviewer.email, `${session.eventName}: reviews are waiting`,
    `Hi ${reviewer.name}, you still have assigned program reviews to complete.`)));
  return context.json({ ok: true, sent: outstanding.results.length, message: `${outstanding.results.length} reminder${outstanding.results.length === 1 ? "" : "s"} logged.` });
});

reviews.post("/ai/:proposalId/override", async (context) => {
  const session = await requireSession(context);
  if (!session || !isOrganizer(session)) return context.json({ error: "Only organizers can override AI advice." }, 403);
  const parsed = z.object({ disposition: z.enum(["advance", "hold", "decline"]), reason: z.string().min(3) })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Choose a disposition and explain the human override." }, 400);
  await context.env.DB.prepare(
    `UPDATE ai_recommendations SET overridden_by = ?, override_disposition = ?, override_reason = ?, updated_at = CURRENT_TIMESTAMP
     WHERE proposal_id = ?`,
  ).bind(session.userId, parsed.data.disposition, parsed.data.reason, context.req.param("proposalId")).run();
  return context.json({ ok: true, message: "Human override saved separately from the AI recommendation." });
});

export { reviews };
