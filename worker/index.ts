import { Hono } from "hono";

import { auth } from "./routes/auth";
import { workspaceContext } from "./routes/context";
import { demo } from "./routes/demo";
import { events } from "./routes/events";
import { proposals } from "./routes/proposals";
import { reviews } from "./routes/reviews";
import { speakers } from "./routes/speakers";
import { speakerResources } from "./routes/speaker-resources";
import { schedule } from "./routes/schedule";
import { publishing } from "./routes/publishing";
import { publicRoutes } from "./routes/public";
import { apiV1 } from "./routes/api-v1";
import { integrations } from "./routes/integrations";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.get("/api/health", async (context) => {
  const database = await context.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();

  return context.json({
    ok: database?.ok === 1,
    service: "program-desk",
    environment: context.env.APP_ENV,
    emailMode: context.env.EMAIL_MODE,
  });
});

app.route("/api/auth", auth);
app.route("/api/demo", demo);
app.route("/api/events", events);
app.route("/api/proposals", proposals);
app.route("/api/reviews", reviews);
app.route("/api/speakers", speakers);
app.route("/api/speaker-resources", speakerResources);
app.route("/api/schedule", schedule);
app.route("/api/publishing", publishing);
app.route("/api/public", publicRoutes);
app.route("/api/v1", apiV1);
app.route("/api/integrations", integrations);
app.route("/api/context", workspaceContext);

app.notFound((context) => context.json({ error: "Not found" }, 404));

export default app;
