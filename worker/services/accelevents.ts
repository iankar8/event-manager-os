export type AcceleventsRecordType = "speaker" | "session";
export type AcceleventsAction = "create" | "update" | "skip" | "warning";

export type SourceSpeaker = {
  id: string;
  name: string;
  email: string;
  title?: string | null;
  company?: string | null;
  bio?: string | null;
  headshot_url?: string | null;
  twitter?: string | null;
};

export type SourceSession = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  room_name?: string | null;
  format_name?: string | null;
  speaker_ids?: string | null;
};

export type SyncSourceRecord = {
  recordType: AcceleventsRecordType;
  sourceId: string;
  payload: Record<string, unknown>;
  unsupportedFields: string[];
};

export type StoredSyncRecord = {
  record_type: AcceleventsRecordType;
  source_id: string;
  external_id: string;
  payload_hash: string;
  payload_json: string;
};

export type SyncPlanItem = SyncSourceRecord & {
  action: AcceleventsAction;
  externalId: string | null;
  payloadHash: string;
  diff: Record<string, { before: unknown; after: unknown }>;
};

function splitName(name: string) {
  const pieces = name.trim().split(/\s+/);
  if (pieces.length === 1) return { firstName: pieces[0], lastName: "" };
  return { firstName: pieces.slice(0, -1).join(" "), lastName: pieces.at(-1) ?? "" };
}

function sessionFormat(value?: string | null) {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("keynote")) return "MAIN_STAGE";
  if (normalized.includes("workshop")) return "WORKSHOP";
  if (normalized.includes("meet")) return "MEET_UP";
  return "BREAKOUT_SESSION";
}

function acceleventsDate(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid schedule timestamp: ${value}`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

export function mapAcceleventsRecords(input: {
  speakers: SourceSpeaker[];
  sessions: SourceSession[];
  timezone: string;
  sessionTypeFormat: "IN_PERSON" | "VIRTUAL" | "HYBRID";
}) {
  const speakerRecords: SyncSourceRecord[] = input.speakers.map((speaker) => ({
    recordType: "speaker",
    sourceId: speaker.id,
    payload: {
      ...splitName(speaker.name),
      email: speaker.email.toLowerCase(),
      title: speaker.title ?? "",
      company: speaker.company ?? "",
      bio: speaker.bio ?? "",
      imageUrl: speaker.headshot_url ?? "",
      twitter: speaker.twitter ?? "",
      allowOverrideDetails: true,
      allowAttendeeAccess: true,
    },
    unsupportedFields: [],
  }));

  const sessionRecords: SyncSourceRecord[] = input.sessions.map((session) => ({
    recordType: "session",
    sourceId: session.id,
    payload: {
      title: session.title,
      description: session.description,
      startTime: acceleventsDate(session.starts_at, input.timezone),
      endTime: acceleventsDate(session.ends_at, input.timezone),
      location: session.room_name ?? "",
      format: sessionFormat(session.format_name),
      status: "VISIBLE",
      sessionVisibilityType: "PUBLIC",
      sessionTypeFormat: input.sessionTypeFormat,
    },
    unsupportedFields: session.speaker_ids ? ["speaker assignments require destination-side confirmation"] : [],
  }));

  return [...speakerRecords, ...sessionRecords];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableValue(item)]));
}

export function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export async function payloadHash(payload: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(stableJson(payload));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function diffPayload(before: Record<string, unknown>, after: Record<string, unknown>) {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (stableJson(before[key]) !== stableJson(after[key])) diff[key] = { before: before[key], after: after[key] };
  }
  return diff;
}

export async function buildAcceleventsPlan(source: SyncSourceRecord[], stored: StoredSyncRecord[]) {
  const storedBySource = new Map(stored.map((record) => [`${record.record_type}:${record.source_id}`, record]));
  const items: SyncPlanItem[] = [];
  for (const record of source) {
    const previous = storedBySource.get(`${record.recordType}:${record.sourceId}`);
    const hash = await payloadHash(record.payload);
    const before = previous ? JSON.parse(previous.payload_json) as Record<string, unknown> : {};
    items.push({
      ...record,
      action: !previous ? "create" : previous.payload_hash === hash ? "skip" : "update",
      externalId: previous?.external_id ?? null,
      payloadHash: hash,
      diff: previous ? diffPayload(before, record.payload) : {},
    });
    storedBySource.delete(`${record.recordType}:${record.sourceId}`);
  }
  for (const previous of storedBySource.values()) {
    items.push({
      recordType: previous.record_type,
      sourceId: previous.source_id,
      payload: {},
      unsupportedFields: ["source record is removed or unpublished; Accelevents deletion is intentionally blocked"],
      action: "warning",
      externalId: previous.external_id,
      payloadHash: previous.payload_hash,
      diff: {},
    });
  }
  return items;
}

export class AcceleventsClient {
  constructor(
    private readonly eventUrl: string,
    private readonly apiKey: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  private async call(path: string, init: RequestInit) {
    const response = await this.request(`https://api.accelevents.com/rest/host/event/${encodeURIComponent(this.eventUrl)}${path}`, {
      ...init,
      headers: { "content-type": "application/json", Key: this.apiKey, ...init.headers },
    });
    if (!response.ok) throw new Error(`Accelevents ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const text = await response.text();
    return text ? JSON.parse(text) as unknown : null;
  }

  async create(recordType: AcceleventsRecordType, payload: Record<string, unknown>) {
    const result = await this.call(`/${recordType}`, { method: "POST", body: JSON.stringify(payload) });
    if (typeof result !== "number" && typeof result !== "string") throw new Error("Accelevents did not return a record ID.");
    return String(result);
  }

  async update(recordType: AcceleventsRecordType, externalId: string, payload: Record<string, unknown>) {
    await this.call(`/${recordType}/${encodeURIComponent(externalId)}`, { method: "PUT", body: JSON.stringify(payload) });
    return externalId;
  }
}
