export type Role = "owner" | "admin" | "organizer" | "reviewer" | "speaker";

export type WorkspaceContext = {
  session: {
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
  summary: {
    proposals: { status: string; count: number }[];
    reviews: { status: string; count: number }[];
    tasks: { status: string; count: number }[];
    sessions: number;
  };
  personas: { role: Role; name: string }[];
};

export type TraceStage = {
  key: "submitted" | "reviewed" | "accepted" | "onboarding" | "approved" | "scheduled" | "published";
  label: string;
  complete: boolean;
  actorName: string | null;
  actorRole: string | null;
  occurredAt: string | null;
  evidence: string;
  rule: string;
  receiptType: string | null;
  receiptId: string | null;
  destination: string;
  section: string;
};

export type ProofTrace = {
  proposalId: string;
  sessionId: string;
  title: string;
  trackName: string | null;
  speakerName: string | null;
  completeStages: number;
  stages: TraceStage[];
};

export type TraceResponse = { trace: ProofTrace | null; reason?: string };
