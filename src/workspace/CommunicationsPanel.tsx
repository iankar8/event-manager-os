import { FormEvent, useEffect, useState } from "react";
import { MailCheck, MessageSquareText, Send } from "lucide-react";

import { apiRequest } from "../lib/api";
import { useResource } from "../lib/useResource";
import { EmptyBlock, ErrorBlock, formatDateTime, LoadingBlock, Notice, Row, StatusChip } from "./shared";

type PublishingData = { templates: Row[]; communications: Row[] } & Record<string, unknown>;

export function CommunicationsPanel() {
  const resource = useResource<PublishingData>("/api/publishing");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { if (!selectedId && resource.data?.templates[0]) setSelectedId(String(resource.data.templates[0].id)); }, [resource.data, selectedId]);
  const template = resource.data?.templates.find((item) => item.id === selectedId);

  if (resource.loading) return <LoadingBlock label="Loading communication templates and outbox…" />;
  if (resource.error) return <ErrorBlock message={resource.error} />;
  if (!resource.data) return null;
  return <div className="communications-workspace">
    {message ? <Notice>{message}</Notice> : null}
    <section className="panel-card template-list"><header className="section-toolbar"><div><p className="eyebrow">Communication settings</p><h2>Templates and triggers</h2><p>External sends stay in the local outbox for this build; every dispatch is logged.</p></div><MailCheck size={20} /></header>
      {resource.data.templates.map((item) => <button key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(String(item.id))}>
        <span><strong>{item.name}</strong><small>{item.subject}</small></span><span><StatusChip value={item.delivery_mode} /><small>{item.enabled ? "Enabled" : "Disabled"}</small></span></button>)}</section>
    <section className="panel-card template-editor">{template ? <TemplateEditor key={String(template.id)} template={template} onSaved={async (text) => { setMessage(text); await resource.reload(); }} /> : null}</section>
    <section className="panel-card preview-panel"><header><p className="eyebrow">Live preview</p><h2>{template?.subject.replaceAll("{proposal_title}", "Taming 40-Minute CI").replaceAll("{session_title}", "Taming 40-Minute CI")}</h2></header>
      <div className="email-preview"><div><span className="avatar">PR</span><span><strong>Event Manager OS</strong><small>to Priya Raman</small></span></div><p>{String(template?.body ?? "").replaceAll("{speaker_name}", "Priya").replaceAll("{proposal_title}", "Taming 40-Minute CI").replaceAll("{session_title}", "Taming 40-Minute CI").replaceAll("{assignment_count}", "4").replaceAll("{deadline}", "October 15")}</p></div>
    </section>
    <section className="panel-card outbox-panel"><header className="section-toolbar"><div><p className="eyebrow">Communication log</p><h2>Outbox receipts</h2></div><Send size={18} /></header>
      {resource.data.communications.length ? <div className="outbox-list">{resource.data.communications.map((item) => <article key={item.id}><MessageSquareText size={16} /><span><strong>{item.subject}</strong><small>{item.recipient_email} · {formatDateTime(item.sent_at ?? item.created_at)}</small></span><StatusChip value={item.status} /></article>)}</div> : <EmptyBlock title="Nothing sent yet">Decision notifications, reminders, and broadcasts will appear here.</EmptyBlock>}
    </section>
  </div>;
}

function TemplateEditor({ template, onSaved }: { template: Row; onSaved: (message: string) => void }) {
  const [subject, setSubject] = useState(String(template.subject)); const [body, setBody] = useState(String(template.body));
  const [enabled, setEnabled] = useState(Boolean(template.enabled)); const [mode, setMode] = useState(String(template.delivery_mode));
  async function submit(event: FormEvent) { event.preventDefault(); const result = await apiRequest<{ message: string }>(`/api/publishing/templates/${template.id}`, { method: "PATCH",
    body: JSON.stringify({ subject, body, enabled, deliveryMode: mode }) }); onSaved(result.message); }
  return <form className="stack-form" onSubmit={submit}><div><p className="eyebrow">Edit template</p><h2>{template.name}</h2></div>
    <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>Body<textarea rows={8} value={body} onChange={(event) => setBody(event.target.value)} /></label>
    <div className="two-field-row"><label>Delivery<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="immediate">Immediate</option><option value="daily_digest">Daily digest</option><option value="manual">Manual</option><option value="off">Off</option></select></label>
      <label className="check-label"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Template enabled</label></div>
    <p className="constraint-copy">Available merge fields: {`{speaker_name}, {proposal_title}, {session_title}, {assignment_count}, {deadline}`}</p>
    <button className="button button-accent">Save and refresh preview</button></form>;
}
