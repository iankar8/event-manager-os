import { FormEvent, useEffect, useState } from "react";
import { BookOpen, ExternalLink, Plus, ShieldCheck, Video } from "lucide-react";

import { apiRequest } from "../lib/api";
import { useResource } from "../lib/useResource";
import { EmptyBlock, ErrorBlock, formatDateTime, LoadingBlock, Notice, Row, StatusChip } from "./shared";

type ResourceData = {
  resources: Row[];
  versions: Row[];
  scopes: { sessions: Row[]; tracks: Row[]; speakers: Row[] };
};

export function SpeakerResourcesPanel({ role }: { role: "organizer" | "speaker" }) {
  const resource = useResource<ResourceData>("/api/speaker-resources");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && resource.data?.resources[0]) setSelectedId(String(resource.data.resources[0].id));
  }, [resource.data, selectedId]);
  if (resource.loading) return <LoadingBlock label="Loading speaker resources…" />;
  if (resource.error) return <ErrorBlock message={resource.error} />;
  if (!resource.data) return null;

  if (role === "speaker") return <SpeakerLibrary resources={resource.data.resources} />;
  const selected = resource.data.resources.find((item) => item.id === selectedId);
  const creating = selectedId === "new" || !resource.data.resources.length;
  return <div className="content-workspace resource-workspace">
    {message ? <Notice>{message}</Notice> : null}
    {warning ? <Notice tone="warning">{warning}</Notice> : null}
    <section className="panel-card content-list"><header><p className="eyebrow">Speaker resource library</p><h2>{resource.data.resources.length} pages</h2>
      <p>Publish event guidance once, then scope it to a session, track, or individual speaker.</p>
      <button className="button button-quiet button-small" type="button" onClick={() => setSelectedId("new")}><Plus size={14} /> New resource</button></header>
      {resource.data.resources.map((item) => <button type="button" key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(String(item.id))}>
        <span><strong>{item.title}</strong><small>{item.scope_label} · version {item.version}</small></span><StatusChip value={item.status} /></button>)}
    </section>
    <section className="panel-card content-editor"><ResourceEditor key={creating ? "new" : String(selected?.id)} resource={creating ? null : selected ?? null}
      data={resource.data} onSaved={async (result) => { setWarning(null); setMessage(result.message); setSelectedId(String(result.resource.id)); await resource.reload(); }}
      onError={(text) => { setMessage(null); setWarning(text); }} /></section>
    <section className="panel-card gate-card"><ShieldCheck size={19} /><div><strong>Audience and embed gates are enforced</strong>
      <p>Speakers receive only published pages in their event, session, track, or individual scope. Embed HTML is reduced to an approved HTTPS iframe URL before storage.</p></div><StatusChip value="enforced" /></section>
  </div>;
}

function SpeakerLibrary({ resources }: { resources: Row[] }) {
  return <div className="resource-library"><header className="panel-card resource-library-heading"><BookOpen size={22} /><div><p className="eyebrow">Speaker handbook</p>
    <h2>Resources for your sessions</h2><p>Only published guidance assigned to you, your sessions, or your tracks appears here.</p></div></header>
    {resources.length ? resources.map((item) => <article className="panel-card resource-page" key={item.id}><header><div><StatusChip value={item.status} />
      <small>{item.scope_label} · version {item.version} · updated {formatDateTime(item.updated_at)}</small></div><h3>{item.title}</h3><p>{item.summary}</p></header>
      {item.body ? <p className="resource-body">{item.body}</p> : null}
      {item.link_url ? <a className="button button-quiet" href={String(item.link_url)} target="_blank" rel="noreferrer">{item.link_label || "Open resource"}<ExternalLink size={14} /></a> : null}
      {item.embed_url ? <details className="resource-embed"><summary><Video size={15} /> Open {item.embed_title}</summary><iframe src={String(item.embed_url)} title={String(item.embed_title)}
        sandbox="allow-scripts allow-same-origin allow-presentation" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></details> : null}
    </article>) : <section className="panel-card"><EmptyBlock title="No resources assigned yet">Published event and session guidance will appear here when the program team assigns it.</EmptyBlock></section>}
  </div>;
}

function ResourceEditor({ resource, data, onSaved, onError }: {
  resource: Row | null; data: ResourceData;
  onSaved: (result: { message: string; resource: Row }) => void; onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(String(resource?.title ?? "Speaker day handbook"));
  const [summary, setSummary] = useState(String(resource?.summary ?? "Arrival, stage, and production guidance for speakers."));
  const [body, setBody] = useState(String(resource?.body ?? "Add the instructions speakers need before they arrive."));
  const [status, setStatus] = useState(String(resource?.status ?? "draft"));
  const [scopeType, setScopeType] = useState(String(resource?.scope_type ?? "all"));
  const [scopeId, setScopeId] = useState(String(resource?.scope_id ?? ""));
  const [linkLabel, setLinkLabel] = useState(String(resource?.link_label ?? ""));
  const [linkUrl, setLinkUrl] = useState(String(resource?.link_url ?? ""));
  const [embedHtml, setEmbedHtml] = useState(resource?.embed_url
    ? `<iframe src="${resource.embed_url}" title="${resource.embed_title ?? "Embedded speaker resource"}"></iframe>` : "");
  const [pending, setPending] = useState(false);
  const options = scopeType === "session" ? data.scopes.sessions : scopeType === "track" ? data.scopes.tracks : data.scopes.speakers;
  function changeScope(next: string) { setScopeType(next); setScopeId(next === "all" ? "" : String((next === "session" ? data.scopes.sessions : next === "track" ? data.scopes.tracks : data.scopes.speakers)[0]?.id ?? "")); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true);
    try {
      const result = await apiRequest<{ message: string; resource: Row }>(resource ? `/api/speaker-resources/${resource.id}` : "/api/speaker-resources", {
        method: resource ? "PATCH" : "POST", body: JSON.stringify({ title, summary, body, status, scopeType,
          scopeId: scopeType === "all" ? null : scopeId, sortOrder: Number(resource?.sort_order ?? data.resources.length * 10 + 10),
          linkLabel, linkUrl, embedHtml }),
      });
      onSaved(result);
    } catch (reason) { onError(reason instanceof Error ? reason.message : "The speaker resource could not be saved."); }
    finally { setPending(false); }
  }
  return <form className="stack-form" onSubmit={submit}><div><p className="eyebrow">{resource ? `Version ${resource.version}` : "New resource"}</p>
    <h2>{resource ? resource.title : "Create speaker guidance"}</h2><p>{resource ? `${resource.scope_label} · last edited by ${resource.author_name}` : "Draft first, choose an audience, then publish when it is ready."}</p></div>
    <label>Title<input required minLength={3} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Summary<input maxLength={500} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
    <label>Resource content<textarea rows={7} maxLength={20_000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
    <label>Audience<select value={scopeType} onChange={(event) => changeScope(event.target.value)}><option value="all">All event speakers</option><option value="session">Selected session</option><option value="track">Selected track</option><option value="speaker">Individual speaker</option></select></label>
    {scopeType !== "all" ? <label>{scopeType[0].toUpperCase() + scopeType.slice(1)}<select required value={scopeId} onChange={(event) => setScopeId(event.target.value)}>
      {options.map((item) => <option key={item.id} value={item.id}>{item.title ?? item.name}</option>)}</select></label> : null}
    <label>State<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="draft">Draft — hidden from speakers</option><option value="published">Published — visible within scope</option></select></label>
    <label>Link label<input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} placeholder="Open production guide" /></label>
    <label>HTTPS link<input type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" /></label>
    <label>Approved iframe HTML<textarea rows={3} value={embedHtml} onChange={(event) => setEmbedHtml(event.target.value)} placeholder={'<iframe src="https://www.youtube.com/embed/…" title="Rehearsal"></iframe>'} /></label>
    <button className="button button-accent" disabled={pending}>{pending ? "Saving…" : resource ? "Save new version" : "Create resource"}</button>
  </form>;
}
