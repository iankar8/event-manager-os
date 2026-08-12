import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArchiveRestore, Download, FileCheck2, History, ShieldAlert } from "lucide-react";

import { apiRequest } from "../lib/api";
import { useResource } from "../lib/useResource";
import { EmptyBlock, ErrorBlock, formatDateTime, LoadingBlock, Notice, Row, StatusChip } from "./shared";

type ContentData = { sessions: Row[]; files: Row[]; history: Row[] } & Record<string, unknown>;

export function ContentPanel() {
  const resource = useResource<ContentData>("/api/speakers");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const uniqueSessions = useMemo(() => {
    const byId = new Map<string, Row>();
    for (const item of resource.data?.sessions ?? []) {
      const id = String(item.id); const existing = byId.get(id);
      byId.set(id, existing ? { ...existing, speaker_name: `${existing.speaker_name}, ${item.speaker_name}` } : item);
    }
    return [...byId.values()];
  }, [resource.data]);
  useEffect(() => { if (!selectedId && uniqueSessions[0]) setSelectedId(String(uniqueSessions[0].id)); }, [uniqueSessions, selectedId]);
  const session = uniqueSessions.find((item) => item.id === selectedId);
  if (resource.loading) return <LoadingBlock label="Loading sessions and content history…" />;
  if (resource.error) return <ErrorBlock message={resource.error} />;
  if (!resource.data) return null;
  return <div className="content-workspace">
    {message ? <Notice>{message}</Notice> : null}
    <section className="panel-card content-list"><header><p className="eyebrow">Central content management</p><h2>{uniqueSessions.length} sessions</h2><p>Approve public copy, inspect connected speakers, and restore prior versions.</p></header>
      {uniqueSessions.map((item) => <button key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(String(item.id))}><span><strong>{item.title}</strong><small>{item.speaker_name} · {item.track_name}</small></span><StatusChip value={item.content_status} /></button>)}</section>
    <section className="panel-card content-editor">{session ? <SessionEditor key={String(session.id)} session={session} onSaved={async (text) => { setMessage(text); await resource.reload(); }} /> : <EmptyBlock title="Choose a session">Select a session to edit and approve.</EmptyBlock>}</section>
    <section className="panel-card gate-card"><ShieldAlert size={19} /><div><strong>Public approval gate is active</strong><p>Only sessions marked Approved and placed in the published schedule revision reach public widgets, feeds, and embeds.</p></div><StatusChip value="enforced" /></section>
    <section className="panel-card files-library"><header className="section-toolbar"><div><p className="eyebrow">Files library</p><h2>Latest deliverables and retained versions</h2></div><a className="button button-quiet" href="/api/speakers/files/latest.zip"><Download size={15} /> Download latest as ZIP</a></header>
      {resource.data.files.length ? resource.data.files.map((file) => <article key={file.id}><FileCheck2 size={16} /><span><strong>{file.file_name}</strong><small>{file.speaker_name} · {file.session_title} · version {file.version} · {formatDateTime(file.created_at)}</small></span><StatusChip value={file.is_latest ? "latest" : "previous"} /><a className="button button-quiet button-small" href={`/api/speakers/files/${file.id}`}>Download</a></article>) : <EmptyBlock title="No deliverables yet">Speaker uploads will appear with task, session, author, date, and version metadata.</EmptyBlock>}
    </section>
    <section className="panel-card history-panel"><header className="section-toolbar"><div><p className="eyebrow">Change history</p><h2>Restorable content versions</h2></div><History size={18} /></header>
      {resource.data.history.length ? resource.data.history.map((version) => <article key={version.id}><span><strong>{version.entity_type} · version {version.version}</strong><small>{version.change_summary} · {version.editor_name} · {formatDateTime(version.created_at)}</small></span><button className="button button-quiet button-small" onClick={async () => { const result = await apiRequest<{ message: string }>(`/api/speakers/versions/${version.id}/restore`, { method: "POST", body: JSON.stringify({}) }); setMessage(result.message); await resource.reload(); }}><ArchiveRestore size={13} /> Restore</button></article>) : <EmptyBlock title="No edits recorded yet">The first content or profile edit will create a restorable snapshot.</EmptyBlock>}
    </section>
  </div>;
}

function SessionEditor({ session, onSaved }: { session: Row; onSaved: (message: string) => void }) {
  const [title, setTitle] = useState(String(session.title)); const [description, setDescription] = useState(String(session.description));
  const [contentStatus, setContentStatus] = useState(String(session.content_status));
  async function submit(event: FormEvent) { event.preventDefault(); const result = await apiRequest<{ message: string }>(`/api/speakers/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify({ title, description, contentStatus }) }); onSaved(result.message); }
  return <form className="stack-form" onSubmit={submit}><div><p className="eyebrow">Canonical session record</p><h2>{session.title}</h2><p>{session.speaker_name} · {session.track_name} · {session.format_name}</p></div>
    <label>Public session title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Public description<textarea rows={9} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <label>Content approval status<select value={contentStatus} onChange={(event) => setContentStatus(event.target.value)}><option value="draft">Draft — exclude from public output</option><option value="approved">Approved — eligible for public output</option></select></label>
    <button className="button button-accent">Save, version, and apply gate</button></form>;
}
