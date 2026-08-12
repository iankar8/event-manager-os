import { FormEvent, useState } from "react";
import { ArrowRight, Building2, CalendarPlus, CodeXml, ExternalLink, KeyRound, Sparkles } from "lucide-react";

import { apiRequest } from "../lib/api";
import { useResource } from "../lib/useResource";
import { ErrorBlock, formatDate, LoadingBlock, Notice, Row, StatusChip } from "./shared";

type PublishingData = { event: Row; domains: Row[]; form: Row; fields: Row[]; tracks: Row[]; formats: Row[] } & Record<string, unknown>;
type EventsData = { events: Row[] };

export function SettingsPanel({ onEventChanged }: { onEventChanged: () => Promise<void> }) {
  const resource = useResource<PublishingData>("/api/publishing");
  const events = useResource<EventsData>("/api/events");
  const [tab, setTab] = useState("cfp");
  const [message, setMessage] = useState<string | null>(null);

  async function saved(text: string) { setMessage(text); await Promise.all([resource.reload(), events.reload()]); }
  if (resource.loading || events.loading) return <LoadingBlock label="Loading program settings…" />;
  if (resource.error || events.error) return <ErrorBlock message={resource.error ?? events.error ?? "Settings failed to load."} />;
  if (!resource.data || !events.data) return null;

  return <div className="settings-workspace">
    {message ? <Notice>{message}</Notice> : null}
    <nav className="settings-tabs" aria-label="Settings sections">{[["cfp", "Submission form"], ["access", "Access & domains"], ["advisor", "AI advisor"], ["events", "Events"]].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === "cfp" ? <CfpSettings data={resource.data} onSaved={saved} /> : null}
    {tab === "access" ? <AccessSettings data={resource.data} onSaved={saved} /> : null}
    {tab === "advisor" ? <AdvisorSettings data={resource.data} onSaved={saved} /> : null}
    {tab === "events" ? <EventSettings events={events.data.events} onSaved={saved} onEventChanged={onEventChanged} /> : null}
  </div>;
}

function CfpSettings({ data, onSaved }: { data: PublishingData; onSaved: (message: string) => void }) {
  const [closesAt, setClosesAt] = useState(String(data.form?.closes_at ?? "").slice(0, 16));
  const [status, setStatus] = useState(String(data.form?.status ?? "draft"));
  const [showField, setShowField] = useState(false);
  async function saveWindow(event: FormEvent) { event.preventDefault(); const result = await apiRequest<{ message: string }>("/api/publishing/cfp", { method: "PATCH",
    body: JSON.stringify({ closesAt: new Date(closesAt).toISOString(), status, redirectUrl: data.form.redirect_url ?? "/app/submissions" }) }); onSaved(result.message); }
  return <div className="settings-stack">
    <section className="panel-card"><header className="section-toolbar"><div><p className="eyebrow">Public Call for Papers</p><h2>Submission window and portal</h2><p>The deadline is enforced server-side for new proposals and speaker edits.</p></div><a className="button button-quiet" href={`/events/${data.event.slug}/cfp`} target="_blank" rel="noreferrer">View public form <ExternalLink size={14} /></a></header>
      <form className="inline-form" onSubmit={saveWindow}><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option></select></label>
        <label>Submission closes<input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} /></label><button className="button button-accent">Save submission window</button></form></section>
    <section className="panel-card form-builder"><header className="section-toolbar"><div><p className="eyebrow">Form builder</p><h2>{data.fields.length} configured fields</h2><p>Short text, long text, dropdowns, required flags, and conditional visibility persist to the public portal.</p></div><button className="button button-accent" onClick={() => setShowField((value) => !value)}>+ Add custom field</button></header>
      {showField ? <FieldForm onAdded={onSaved} /> : null}<div className="field-list">{data.fields.map((field, index) => <article key={field.id}><span className="field-order">{String(index + 1).padStart(2, "0")}</span><span><strong>{field.label}</strong><small>{field.help_text || "No helper copy"}</small></span>
        <span className="field-config"><code>{field.field_type.replace("_", " ")}</code><StatusChip value={field.required ? "required" : "optional"} />{field.condition_field_key ? <em>Show when {field.condition_field_key} = {field.condition_value}</em> : null}</span></article>)}</div></section>
    <section className="panel-card option-library"><div><strong>Tracks</strong><p>{data.tracks.map((track) => track.name).join(" · ")}</p></div><div><strong>Session formats</strong><p>{data.formats.map((format) => format.name).join(" · ")}</p></div></section>
  </div>;
}

function FieldForm({ onAdded }: { onAdded: (message: string) => void }) {
  const [label, setLabel] = useState("Audience goals"); const [fieldType, setType] = useState("short_text"); const [required, setRequired] = useState(true);
  const [conditional, setConditional] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); const result = await apiRequest<{ message: string }>("/api/publishing/cfp/fields", { method: "POST",
    body: JSON.stringify({ label, fieldType, required, options: fieldType === "select" ? ["Beginner", "Intermediate", "Advanced"] : [], helpText: "Visible on the public proposal form.",
      conditionFieldKey: conditional ? "format" : null, conditionValue: conditional ? "Workshop (120 min)" : null }) }); onAdded(result.message); }
  return <form className="inline-form field-create-form" onSubmit={submit}><label>Field label<input value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Type<select value={fieldType} onChange={(event) => setType(event.target.value)}><option value="short_text">Short text</option><option value="long_text">Long text</option><option value="select">Dropdown</option></select></label>
    <label className="check-label"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /> Required</label><label className="check-label"><input type="checkbox" checked={conditional} onChange={(event) => setConditional(event.target.checked)} /> Workshop only</label><button className="button button-accent">Add field</button></form>;
}

function AccessSettings({ data, onSaved }: { data: PublishingData; onSaved: (message: string) => void }) {
  const [domain, setDomain] = useState("cohost.example");
  async function submit(event: FormEvent) { event.preventDefault(); const result = await apiRequest<{ message: string }>("/api/publishing/domains", { method: "POST", body: JSON.stringify({ domain }) }); onSaved(result.message); }
  return <div className="settings-grid"><section className="panel-card"><header><KeyRound size={19} /><p className="eyebrow">Passwordless access</p><h2>Company-scoped organizer access</h2><p>Anyone using an approved company domain can join. Owners and admins retain a visible access ledger.</p></header>
    <form className="inline-form" onSubmit={submit}><label>Add collaborating company domain<input value={domain} onChange={(event) => setDomain(event.target.value)} /></label><button className="button button-accent">Approve domain</button></form>
    <div className="domain-list">{data.domains.map((item) => <article key={item.id}><Building2 size={15} /><strong>@{item.domain}</strong><StatusChip value={item.status} /></article>)}</div></section>
    <section className="panel-card join-link-card"><p className="eyebrow">Shareable team join</p><h2>Organizer join link</h2><p>Post this link in a trusted Slack channel. Email-domain rules are still checked at join time.</p><code>/join/organizer/devflow-team</code><button className="button button-quiet">Copy organizer join link</button></section></div>;
}

function AdvisorSettings({ data, onSaved }: { data: PublishingData; onSaved: (message: string) => void }) {
  const [name, setName] = useState(String(data.event.advisor_name)); const [persona, setPersona] = useState(String(data.event.advisor_persona));
  const [instructions, setInstructions] = useState(String(data.event.advisor_instructions));
  async function submit(event: FormEvent) { event.preventDefault(); const result = await apiRequest<{ message: string }>("/api/publishing/event", { method: "PATCH",
    body: JSON.stringify({ advisorName: name, advisorPersona: persona, advisorInstructions: instructions }) }); onSaved(result.message); }
  return <section className="panel-card advisor-settings"><header><Sparkles size={20} /><p className="eyebrow">Configurable AI advisor</p><h2>Program Architect system prompt</h2><p>The advisor recommends; it never silently changes a human decision. Research, human scores, and AI reasoning remain separate.</p></header>
    <form className="stack-form" onSubmit={submit}><label>Advisor name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Persona<textarea rows={3} value={persona} onChange={(event) => setPersona(event.target.value)} /></label>
      <label>System instructions<textarea rows={10} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label><button className="button button-accent">Save advisor prompt</button></form></section>;
}

function EventSettings({ events, onSaved, onEventChanged }: { events: Row[]; onSaved: (message: string) => void; onEventChanged: () => Promise<void> }) {
  const [showCreate, setShowCreate] = useState(false); const [name, setName] = useState("Forward Summit 2028");
  async function create(event: FormEvent) { event.preventDefault(); const result = await apiRequest<{ eventId: string }>("/api/events", { method: "POST",
    body: JSON.stringify({ name, startsOn: "2028-05-10", endsOn: "2028-05-12", location: "Austin Convention Center, Austin, TX" }) }); onSaved("Second event created with an empty, isolated program."); setShowCreate(false); await switchTo(result.eventId); }
  async function switchTo(eventId: string) { await apiRequest(`/api/events/${eventId}/switch`, { method: "POST", body: JSON.stringify({}) }); await onEventChanged(); }
  return <section className="panel-card event-settings"><header className="section-toolbar"><div><p className="eyebrow">Multi-event operations</p><h2>{events.length} events in this organization</h2><p>Each event has its own proposals, people, sessions, schedule revisions, and public outputs.</p></div><button className="button button-accent" onClick={() => setShowCreate((value) => !value)}><CalendarPlus size={15} /> New event</button></header>
    {showCreate ? <form className="inline-form" onSubmit={create}><label>Event name<input value={name} onChange={(event) => setName(event.target.value)} /></label><button className="button button-accent">Create isolated event</button></form> : null}
    <div className="event-list">{events.map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>{formatDate(item.starts_on)}–{formatDate(item.ends_on)} · {item.location || "Location pending"}</small></div><StatusChip value={item.active ? "active event" : item.status} />
      <button className="button button-quiet button-small" disabled={Boolean(item.active)} onClick={() => switchTo(String(item.id))}>{item.active ? "Current" : "Open event"} <ArrowRight size={13} /></button></article>)}</div>
    <div className="scope-proof"><CodeXml size={16} /><span>Opening a second event starts with zero proposals, sessions, speakers, and schedule items. Cross-event leakage is blocked by event_id on every query.</span></div></section>;
}
