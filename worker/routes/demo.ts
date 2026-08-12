import { Hono } from "hono";
import { z } from "zod";

import { createSession, deleteSession, getSession } from "../lib/session";
import { seedProgramWorkspace } from "../services/seed";
import type { AppEnv, Role } from "../types";

const demo = new Hono<AppEnv>();
const switchInput = z.object({ role: z.enum(["organizer", "reviewer", "speaker"]) });

demo.post("/start", async (context) => {
  await deleteSession(context);
  const demoKey = crypto.randomUUID().slice(0, 12);
  const workspace = await seedProgramWorkspace(context.env.DB, { demoKey });
  await createSession(context, {
    userId: workspace.users.organizer,
    organizationId: workspace.organizationId,
    eventId: workspace.eventId,
    role: "organizer",
    isDemo: true,
  });
  return context.json({ ok: true, role: "organizer" });
});

demo.post("/switch", async (context) => {
  const session = await getSession(context);
  if (!session?.isDemo) return context.json({ error: "Role switching is available only in Demo Mode." }, 403);
  const parsed = switchInput.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Choose Organizer, Reviewer, or Speaker." }, 400);

  const target = await context.env.DB.prepare(
    `SELECT users.id
     FROM event_members
     JOIN users ON users.id = event_members.user_id
     WHERE event_members.event_id = ? AND event_members.role = ?
     ORDER BY CASE
       WHEN users.email LIKE 'sbek-speaker+%@example.com' OR users.email = 'sbek-speaker@example.com' THEN 1
       ELSE 2
     END, users.name
     LIMIT 1`,
  )
    .bind(session.eventId, parsed.data.role)
    .first<{ id: string }>();
  if (!target) return context.json({ error: `No ${parsed.data.role} persona exists in this demo.` }, 404);

  await deleteSession(context);
  await createSession(context, {
    userId: target.id,
    organizationId: session.organizationId,
    eventId: session.eventId,
    role: parsed.data.role as Role,
    isDemo: true,
  });
  return context.json({ ok: true, role: parsed.data.role });
});

demo.post("/reset", async (context) => {
  const session = await getSession(context);
  if (!session?.isDemo) return context.json({ error: "There is no active demo workspace to reset." }, 400);
  const oldOrganizationId = session.organizationId;
  await deleteSession(context);
  await context.env.DB.prepare("DELETE FROM organizations WHERE id = ? AND is_demo = 1").bind(oldOrganizationId).run();

  const demoKey = crypto.randomUUID().slice(0, 12);
  const workspace = await seedProgramWorkspace(context.env.DB, { demoKey });
  await createSession(context, {
    userId: workspace.users.organizer,
    organizationId: workspace.organizationId,
    eventId: workspace.eventId,
    role: "organizer",
    isDemo: true,
  });
  return context.json({ ok: true, role: "organizer" });
});

export { demo };
