import { Hono } from "hono";
import { z } from "zod";

import { createId, createToken, hashToken, verifyPassword } from "../lib/crypto";
import { createSession, deleteSession, getSession } from "../lib/session";
import { ensureCanonicalWorkspace } from "../services/seed";
import type { AppEnv, Role } from "../types";

const auth = new Hono<AppEnv>();
const loginInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
const magicInput = z.object({ email: z.string().email() });

async function membershipForUser(db: D1Database, userId: string) {
  const eventMembership = await db.prepare(
    `SELECT event_members.event_id, event_members.role, events.organization_id
     FROM event_members
     JOIN events ON events.id = event_members.event_id
     WHERE event_members.user_id = ? AND event_members.status != 'suspended'
     ORDER BY CASE event_members.role WHEN 'organizer' THEN 1 WHEN 'reviewer' THEN 2 ELSE 3 END
     LIMIT 1`,
  )
    .bind(userId)
    .first<{ event_id: string; role: Role; organization_id: string }>();
  if (eventMembership) return eventMembership;

  return db.prepare(
    `SELECT events.id AS event_id, organization_members.role, organizations.id AS organization_id
     FROM organization_members
     JOIN organizations ON organizations.id = organization_members.organization_id
     JOIN events ON events.organization_id = organizations.id
     WHERE organization_members.user_id = ? AND organization_members.status = 'active'
     ORDER BY events.created_at
     LIMIT 1`,
  )
    .bind(userId)
    .first<{ event_id: string; role: Role; organization_id: string }>();
}

auth.post("/login", async (context) => {
  const parsed = loginInput.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Enter a valid email and password." }, 400);

  await ensureCanonicalWorkspace(context.env.DB);
  const user = await context.env.DB.prepare("SELECT id, password_hash FROM users WHERE email = ? COLLATE NOCASE")
    .bind(parsed.data.email)
    .first<{ id: string; password_hash: string | null }>();

  if (!user?.password_hash || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    return context.json({ error: "The email or password is incorrect." }, 401);
  }

  const membership = await membershipForUser(context.env.DB, user.id);
  if (!membership) return context.json({ error: "This account does not have an active event." }, 403);

  await deleteSession(context);
  await createSession(context, {
    userId: user.id,
    organizationId: membership.organization_id,
    eventId: membership.event_id,
    role: membership.role,
    isDemo: false,
  });
  return context.json({ ok: true });
});

auth.post("/magic-link", async (context) => {
  const parsed = magicInput.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Enter a valid email address." }, 400);

  await ensureCanonicalWorkspace(context.env.DB);
  const user = await context.env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE")
    .bind(parsed.data.email)
    .first<{ id: string }>();

  if (!user) {
    return context.json({ ok: true, message: "If that account exists, a sign-in link is on its way." });
  }

  const membership = await membershipForUser(context.env.DB, user.id);
  if (!membership) return context.json({ ok: true, message: "If that account exists, a sign-in link is on its way." });

  const token = createToken();
  const expiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
  await context.env.DB.batch([
    context.env.DB.prepare(
      "INSERT INTO magic_links (id, email, purpose, token_hash, event_id, expires_at) VALUES (?, ?, 'sign_in', ?, ?, ?)",
    ).bind(createId("mag"), parsed.data.email.toLowerCase(), await hashToken(token), membership.event_id, expiresAt),
    context.env.DB.prepare(
      `INSERT INTO communications
        (id, event_id, related_type, related_id, recipient_email, subject, body, status, sent_at)
       VALUES (?, ?, 'auth', ?, ?, 'Your Program Desk sign-in link', ?, 'sent', CURRENT_TIMESTAMP)`,
    ).bind(
      createId("com"),
      membership.event_id,
      user.id,
      parsed.data.email.toLowerCase(),
      `Open /api/auth/magic/${token} within 20 minutes to sign in.`,
    ),
  ]);

  const previewUrl = context.env.EMAIL_MODE === "outbox" ? `/api/auth/magic/${token}` : undefined;
  return context.json({
    ok: true,
    message: "If that account exists, a sign-in link is on its way.",
    previewUrl,
  });
});

auth.get("/magic/:token", async (context) => {
  const tokenHash = await hashToken(context.req.param("token"));
  const link = await context.env.DB.prepare(
    `SELECT magic_links.id, users.id AS user_id
     FROM magic_links
     JOIN users ON users.email = magic_links.email COLLATE NOCASE
     WHERE magic_links.token_hash = ? AND magic_links.used_at IS NULL AND magic_links.expires_at > CURRENT_TIMESTAMP`,
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string }>();

  if (!link) return context.json({ error: "This magic link is invalid or expired." }, 410);
  const membership = await membershipForUser(context.env.DB, link.user_id);
  if (!membership) return context.json({ error: "This account does not have an active event." }, 403);

  await context.env.DB.prepare("UPDATE magic_links SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(link.id).run();
  await deleteSession(context);
  await createSession(context, {
    userId: link.user_id,
    organizationId: membership.organization_id,
    eventId: membership.event_id,
    role: membership.role,
    isDemo: false,
  });
  return context.redirect("/app");
});

auth.post("/logout", async (context) => {
  await deleteSession(context);
  return context.json({ ok: true });
});

auth.get("/session", async (context) => {
  const session = await getSession(context);
  return session ? context.json({ session }) : context.json({ session: null }, 401);
});

export { auth };
