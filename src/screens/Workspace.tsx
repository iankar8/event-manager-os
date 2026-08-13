import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, CalendarDays, ChevronDown, CircleAlert, ClipboardCheck, FileText,
  FolderCheck, Globe2, LayoutDashboard, LogOut, Mail, Menu, PlugZap, RefreshCcw, Settings, Sparkles, Users,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ApiError, apiRequest } from "../lib/api";
import type { Role, WorkspaceContext } from "../types";
import { CommunicationsPanel } from "../workspace/CommunicationsPanel";
import { ContentPanel } from "../workspace/ContentPanel";
import { IntegrationsPanel } from "../workspace/IntegrationsPanel";
import { OverviewPanel } from "../workspace/OverviewPanel";
import { PeoplePanel } from "../workspace/PeoplePanel";
import { ProposalsPanel } from "../workspace/ProposalsPanel";
import { PublishPanel } from "../workspace/PublishPanel";
import { ReviewPanel } from "../workspace/ReviewPanel";
import { SchedulePanel } from "../workspace/SchedulePanel";
import { SpeakerResourcesPanel } from "../workspace/SpeakerResourcesPanel";
import { SettingsPanel } from "../workspace/SettingsPanel";

type EventsData = { events: { id: string; name: string; active: number }[] };
type PersonaRole = "organizer" | "reviewer" | "speaker";
type NavItem = { key: string; label: string; icon: typeof LayoutDashboard };

const navigation: Record<PersonaRole, NavItem[]> = {
  organizer: [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "proposals", label: "Proposals", icon: FileText },
    { key: "reviews", label: "Review plans", icon: ClipboardCheck },
    { key: "people", label: "People", icon: Users },
    { key: "resources", label: "Speaker resources", icon: BookOpen },
    { key: "tasks", label: "Deliverables", icon: ClipboardCheck },
    { key: "content", label: "Content & sessions", icon: FolderCheck },
    { key: "schedule", label: "Schedule", icon: CalendarDays },
    { key: "communications", label: "Communications", icon: Mail },
    { key: "integrations", label: "Integrations", icon: PlugZap },
    { key: "publish", label: "Publish", icon: Globe2 },
    { key: "settings", label: "Settings", icon: Settings },
  ],
  reviewer: [
    { key: "reviews", label: "My reviews", icon: ClipboardCheck },
    { key: "expertise", label: "Expertise & capacity", icon: Sparkles },
  ],
  speaker: [
    { key: "portal", label: "My portal", icon: LayoutDashboard },
    { key: "resources", label: "Speaker resources", icon: BookOpen },
    { key: "submissions", label: "Submissions", icon: FileText },
    { key: "tasks", label: "Tasks & files", icon: ClipboardCheck },
    { key: "schedule", label: "Schedule", icon: CalendarDays },
  ],
};

function normalizeRole(role: Role): PersonaRole {
  return role === "owner" || role === "admin" ? "organizer" : role;
}

function sectionCopy(section: string, role: PersonaRole) {
  const copy: Record<string, [string, string]> = {
    overview: ["Program command center", "Every state, assignment, and public handoff stays attached to the same program record."],
    proposals: ["Proposal operations", "Review submitted facts, research, human evidence, AI advice, and decisions without blurring provenance."],
    submissions: ["My submissions", "Draft, submit, and edit your proposals while the call remains open."],
    reviews: [role === "reviewer" ? "My review queue" : "Evaluation plans", role === "reviewer" ? "Only your assigned proposals are visible." : "Build independent rounds, balance workloads, and watch evidence arrive."],
    expertise: ["Expertise & capacity", "Tell the program team what you know and how many reviews you can reasonably complete."],
    people: ["Speaker operations", "Profiles, statuses, session assignments, and readiness in one view."],
    portal: ["My speaker portal", "Update your public profile and see exactly where you appear."],
    resources: [role === "speaker" ? "Speaker resources" : "Speaker resource operations", role === "speaker" ? "Published guidance for your event, tracks, and sessions." : "Create once, scope precisely, and publish guidance into each speaker portal."],
    tasks: [role === "speaker" ? "Tasks & files" : "Deliverables pipeline", "Due dates, uploads, versions, and reminders remain visible across roles."],
    content: ["Content & sessions", "Approve and version public copy before it can enter the published program."],
    schedule: [role === "speaker" ? "My schedule" : "Schedule workbench", role === "speaker" ? "Your published sessions only." : "Draft, move, resize, validate, then publish without changing the live agenda early."],
    communications: ["Communications", "Preview editable templates and keep a receipt for every queued or sent message."],
    integrations: ["Destination handoffs", "Preview approved records, require an explicit apply, and preserve a receipt for every external change."],
    publish: ["Publish & distribute", "Five attendee surfaces, retrievable embeds, JSON feeds, and one canonical public record."],
    settings: ["Program settings", "Submission form, collaborative domains, AI advisor prompt, and isolated events."],
  };
  return copy[section] ?? copy.overview;
}

export function Workspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<WorkspaceContext | null>(null);
  const [events, setEvents] = useState<EventsData["events"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const load = useCallback(async () => {
    try {
      const [contextData, eventsData] = await Promise.all([
        apiRequest<WorkspaceContext>("/api/context"), apiRequest<EventsData>("/api/events"),
      ]);
      setData(contextData); setEvents(eventsData.events); setError(null);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) navigate("/login", { replace: true });
      else setError(reason instanceof Error ? reason.message : "The workspace could not load.");
    }
  }, [navigate]);
  useEffect(() => void load(), [load]);

  const role = data ? normalizeRole(data.session.role) : "organizer";
  const requestedSection = location.pathname.split("/")[2] || (role === "speaker" ? "portal" : role === "reviewer" ? "reviews" : "overview");
  const section = navigation[role].some((item) => item.key === requestedSection) ? requestedSection : navigation[role][0].key;
  const [title, description] = sectionCopy(section, role);
  const activeNav = useMemo(() => navigation[role], [role]);

  function open(nextSection: string) { navigate(`/app/${nextSection === "overview" ? "" : nextSection}`); setMobileNav(false); }

  async function switchRole(nextRole: PersonaRole) {
    setPending(true);
    try { await apiRequest("/api/demo/switch", { method: "POST", body: JSON.stringify({ role: nextRole }) });
      await load(); navigate(`/app/${nextRole === "organizer" ? "" : nextRole === "reviewer" ? "reviews" : "portal"}`); }
    finally { setPending(false); }
  }
  async function switchEvent(eventId: string) {
    setPending(true); try { await apiRequest(`/api/events/${eventId}/switch`, { method: "POST", body: JSON.stringify({}) }); await load(); navigate("/app"); }
    finally { setPending(false); }
  }
  async function resetDemo() { setPending(true); try { await apiRequest("/api/demo/reset", { method: "POST" }); await load(); navigate("/app"); } finally { setPending(false); } }
  async function signOut() { await apiRequest("/api/auth/logout", { method: "POST" }); navigate("/login", { replace: true }); }

  if (error) return <main className="loading-shell"><CircleAlert /><h1>{error}</h1><button className="button button-ink" onClick={load}>Try again</button></main>;
  if (!data) return <main className="loading-shell"><RefreshCcw className="spinner" /><p>Loading the program workspace…</p></main>;

  return <div className="app-shell">
    {data.session.isDemo ? <div className="demo-banner"><span><Sparkles size={14} /> Demo workspace · changes persist in this isolated event</span><button type="button" disabled={pending} onClick={resetDemo}>Reset demo</button></div> : null}
    <header className="app-topbar">
      <div className="brand-cluster"><button className="mobile-menu-button" onClick={() => setMobileNav((value) => !value)} aria-label="Open workspace navigation"><Menu size={18} /></button>
        <Link className="wordmark" to="/app">Event Manager OS</Link><span className="topbar-rule" />
        {role === "organizer" && events.length > 1 ? <select className="event-switcher" aria-label="Active event" value={data.session.eventId} onChange={(event) => switchEvent(event.target.value)}>{events.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}</select> : <span className="event-label">{data.session.eventName}</span>}</div>
      <div className="topbar-actions">{data.session.isDemo ? <div className="role-control" aria-label="Demo persona">{(["organizer", "reviewer", "speaker"] as const).map((persona) => <button key={persona} type="button" disabled={pending} aria-pressed={role === persona} onClick={() => switchRole(persona)}>{persona[0].toUpperCase() + persona.slice(1)}</button>)}</div> : null}
        <button className="identity-button" type="button"><span className="avatar">{data.session.name.split(" ").map((part) => part[0]).join("")}</span><span><strong>{data.session.name}</strong><small>{role}</small></span><ChevronDown size={14} /></button></div>
    </header>

    <aside className={`app-sidebar ${mobileNav ? "mobile-open" : ""}`}><nav aria-label={`${role} navigation`}>{activeNav.map(({ key, label, icon: Icon }) => <button type="button" className={section === key ? "active" : ""} key={key} onClick={() => open(key)}><Icon size={17} /> {label}</button>)}</nav>
      <div className="sidebar-footer"><span>{data.session.organizationName}</span><button type="button" onClick={signOut}><LogOut size={15} /> Sign out</button></div></aside>

    <main className="app-main">
      <header className="page-heading"><div><p className="eyebrow">{data.session.eventName} / {role}</p><h1>{title}</h1><p>{description}</p></div>
        <button className="button button-ink" type="button" onClick={() => open(role === "organizer" ? "proposals" : role === "reviewer" ? "reviews" : "tasks")}>
          {role === "organizer" ? "Review new proposals" : role === "reviewer" ? "Continue next review" : "Complete next task"}<ArrowRight size={16} /></button></header>
      {section === "overview" ? <OverviewPanel data={data} role={role} open={open} /> : null}
      {section === "proposals" ? <ProposalsPanel role="organizer" eventSlug={data.session.eventSlug} /> : null}
      {section === "submissions" ? <ProposalsPanel role="speaker" eventSlug={data.session.eventSlug} /> : null}
      {section === "reviews" ? <ReviewPanel role={role === "reviewer" ? "reviewer" : "organizer"} /> : null}
      {section === "expertise" ? <ExpertisePanel onSaved={load} /> : null}
      {section === "people" ? <PeoplePanel role="organizer" /> : null}
      {section === "portal" ? <PeoplePanel role="speaker" mode="portal" /> : null}
      {section === "resources" ? <SpeakerResourcesPanel role={role === "speaker" ? "speaker" : "organizer"} /> : null}
      {section === "tasks" ? <PeoplePanel role={role === "speaker" ? "speaker" : "organizer"} mode="tasks" /> : null}
      {section === "content" ? <ContentPanel /> : null}
      {section === "schedule" ? <SchedulePanel role={role === "speaker" ? "speaker" : "organizer"} /> : null}
      {section === "communications" ? <CommunicationsPanel /> : null}
      {section === "integrations" ? <IntegrationsPanel /> : null}
      {section === "publish" ? <PublishPanel eventSlug={data.session.eventSlug} /> : null}
      {section === "settings" ? <SettingsPanel onEventChanged={load} /> : null}
    </main>
  </div>;
}

function ExpertisePanel({ onSaved }: { onSaved: () => Promise<void> }) {
  const [topics, setTopics] = useState("Platform engineering, CI systems, AI verification"); const [capacity, setCapacity] = useState(8); const [message, setMessage] = useState<string | null>(null);
  async function save() { const result = await apiRequest<{ message: string }>("/api/reviews/profile", { method: "POST", body: JSON.stringify({ title: "Staff Engineer", organization: "Northstar Cloud", topics, maxCapacity: capacity, availabilityNote: "Available through October 15", conflictsNote: "Will recuse for current collaborators" }) }); setMessage(result.message); await onSaved(); }
  return <section className="panel-card expertise-card">{message ? <div className="notice notice-success">{message}</div> : null}<header><Sparkles size={21} /><p className="eyebrow">Reviewer onboarding</p><h2>Expertise, availability, and maximum capacity</h2><p>These answers power expertise-first matching. Capacity is a hard ceiling; the allocator balances within it.</p></header>
    <div className="stack-form"><label>Topics and expertise<textarea rows={5} value={topics} onChange={(event) => setTopics(event.target.value)} /></label><label>Maximum proposals<input type="number" min="1" max="500" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} /></label><label className="check-label"><input type="checkbox" defaultChecked /> I accept the confidential-review policy</label><button className="button button-accent" onClick={save}>Mark me ready for assignment</button></div></section>;
}
