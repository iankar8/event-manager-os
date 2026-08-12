export type Bindings = {
  DB: D1Database;
  APP_ENV: string;
  EMAIL_MODE: string;
  ACCELEVENTS_API_KEY?: string;
  ACCELEVENTS_SYNC_MODE?: "outbox" | "live";
};

export type Role = "owner" | "admin" | "organizer" | "reviewer" | "speaker";

export type SessionContext = {
  sessionId: string;
  userId: string;
  organizationId: string;
  eventId: string;
  role: Role;
  isDemo: boolean;
  name: string;
  email: string;
  organizationName: string;
  eventName: string;
  eventSlug: string;
};

export type AppEnv = {
  Bindings: Bindings;
};
