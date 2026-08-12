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
