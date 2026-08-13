import { describe, expect, it } from "vitest";

import app from "./index";

function testBindings(databaseResult: { ok: number } | null = { ok: 1 }) {
  return {
    DB: {
      prepare: () => ({
        first: async () => databaseResult,
      }),
    } as unknown as D1Database,
    APP_ENV: "test",
    EMAIL_MODE: "outbox",
  };
}

describe("Event Manager OS API boundary", () => {
  it("reports a healthy persisted service", async () => {
    const response = await app.request("/api/health", undefined, testBindings());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      service: "program-desk",
      environment: "test",
      emailMode: "outbox",
    });
  });

  it("returns a structured 404 for an unknown API route", async () => {
    const response = await app.request("/api/not-real", undefined, testBindings());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});
