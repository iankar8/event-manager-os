import { describe, expect, it } from "vitest";

import {
  AcceleventsClient,
  buildAcceleventsPlan,
  mapAcceleventsRecords,
  payloadHash,
  type StoredSyncRecord,
} from "./accelevents";

const source = mapAcceleventsRecords({
  timezone: "America/Los_Angeles",
  sessionTypeFormat: "IN_PERSON",
  speakers: [{
    id: "speaker_1",
    name: "Priya Raman",
    email: "PRIYA@example.com",
    title: "Principal Engineer",
    company: "Latticework",
    bio: "Build systems leader.",
    headshot_url: "https://example.com/priya.jpg",
    twitter: "@priyabuilds",
  }],
  sessions: [{
    id: "session_1",
    title: "Verification Patterns",
    description: "How to trust generated code.",
    starts_at: "2027-05-12T17:00:00.000Z",
    ends_at: "2027-05-12T17:30:00.000Z",
    room_name: "Main Stage",
    format_name: "Keynote (45 min)",
    speaker_ids: "speaker_1",
  }],
});

describe("Accelevents sync contract", () => {
  it("maps approved source records into destination-shaped payloads", () => {
    expect(source).toHaveLength(2);
    expect(source[0]).toMatchObject({
      recordType: "speaker",
      sourceId: "speaker_1",
      payload: { firstName: "Priya", lastName: "Raman", email: "priya@example.com" },
    });
    expect(source[1]).toMatchObject({
      recordType: "session",
      payload: {
        startTime: "2027/05/12 10:00",
        endTime: "2027/05/12 10:30",
        location: "Main Stage",
        format: "MAIN_STAGE",
        sessionTypeFormat: "IN_PERSON",
      },
    });
  });

  it("plans create, unchanged replay, targeted update, and no-delete warning", async () => {
    const first = await buildAcceleventsPlan(source, []);
    expect(first.map((item) => item.action)).toEqual(["create", "create"]);

    const stored: StoredSyncRecord[] = await Promise.all(source.map(async (item, index) => ({
      record_type: item.recordType,
      source_id: item.sourceId,
      external_id: String(100 + index),
      payload_hash: await payloadHash(item.payload),
      payload_json: JSON.stringify(item.payload),
    })));
    const unchanged = await buildAcceleventsPlan(source, stored);
    expect(unchanged.map((item) => item.action)).toEqual(["skip", "skip"]);

    const changed = structuredClone(source);
    changed[1].payload.title = "Verification Patterns That Scale";
    const update = await buildAcceleventsPlan(changed, stored);
    expect(update[1]).toMatchObject({ action: "update", externalId: "101",
      diff: { title: { before: "Verification Patterns", after: "Verification Patterns That Scale" } } });

    const removed = await buildAcceleventsPlan([source[0]], stored);
    expect(removed[1]).toMatchObject({ action: "warning", sourceId: "session_1", externalId: "101" });
    expect(removed[1].unsupportedFields.join(" ")).toContain("deletion is intentionally blocked");
  });

  it("uses the documented create/update boundary and surfaces failures for retry", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const request = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/session/42")) return new Response("upstream unavailable", { status: 503 });
      return new Response("41", { status: 200 });
    };
    const client = new AcceleventsClient("devflow-conf", "secret", request as typeof fetch);
    await expect(client.create("speaker", source[0].payload)).resolves.toBe("41");
    expect(calls[0]).toMatchObject({
      url: "https://api.accelevents.com/rest/host/event/devflow-conf/speaker",
      init: { method: "POST", headers: { "content-type": "application/json", Key: "secret" } },
    });
    await expect(client.update("session", "42", source[1].payload)).rejects.toThrow("Accelevents 503");
    expect(calls[1]).toMatchObject({
      url: "https://api.accelevents.com/rest/host/event/devflow-conf/session/42",
      init: { method: "PUT" },
    });
  });
});
