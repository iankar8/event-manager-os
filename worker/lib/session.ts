import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import type { AppEnv, Role, SessionContext } from "../types";
import { createId, createToken, hashToken } from "./crypto";

const SESSION_COOKIE = "pd_session";
const SESSION_DAYS = 7;

export async function createSession(
  context: Context<AppEnv>,
  input: {
    userId: string;
    organizationId: string;
    eventId: string;
    role: Role;
    isDemo: boolean;
  },
) {
  const token = createToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await context.env.DB.prepare(
    `INSERT INTO auth_sessions
      (id, user_id, organization_id, active_event_id, active_role, token_hash, is_demo, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      createId("ses"),
      input.userId,
      input.organizationId,
      input.eventId,
      input.role,
      tokenHash,
      input.isDemo ? 1 : 0,
      expiresAt.toISOString(),
    )
    .run();

  setCookie(context, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: context.env.APP_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function deleteSession(context: Context<AppEnv>) {
  const token = getCookie(context, SESSION_COOKIE);
  if (token) {
    await context.env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .bind(await hashToken(token))
      .run();
  }
  deleteCookie(context, SESSION_COOKIE, { path: "/" });
}

export async function getSession(context: Context<AppEnv>): Promise<SessionContext | null> {
  const token = getCookie(context, SESSION_COOKIE);
  if (!token) return null;

  const row = await context.env.DB.prepare(
    `SELECT
       auth_sessions.id AS session_id,
       auth_sessions.user_id,
       auth_sessions.organization_id,
       auth_sessions.active_event_id AS event_id,
       auth_sessions.active_role AS role,
       auth_sessions.is_demo,
       users.name,
       users.email,
       organizations.name AS organization_name,
       events.name AS event_name,
       events.slug AS event_slug
     FROM auth_sessions
     JOIN users ON users.id = auth_sessions.user_id
     JOIN organizations ON organizations.id = auth_sessions.organization_id
     JOIN events ON events.id = auth_sessions.active_event_id
     WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > CURRENT_TIMESTAMP`,
  )
    .bind(await hashToken(token))
    .first<{
      session_id: string;
      user_id: string;
      organization_id: string;
      event_id: string;
      role: Role;
      is_demo: number;
      name: string;
      email: string;
      organization_name: string;
      event_name: string;
      event_slug: string;
    }>();

  if (!row) return null;
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    role: row.role,
    isDemo: row.is_demo === 1,
    name: row.name,
    email: row.email,
    organizationName: row.organization_name,
    eventName: row.event_name,
    eventSlug: row.event_slug,
  };
}
