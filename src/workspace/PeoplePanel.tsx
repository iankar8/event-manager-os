import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Check, FileArchive, Mail, Search, Upload, UserPlus } from "lucide-react";

import { apiRequest } from "../lib/api";
import { useResource } from "../lib/useResource";
import { EmptyBlock, ErrorBlock, formatDate, formatDateTime, LoadingBlock, Notice, Row, StatusChip } from "./shared";

type PeopleData = { speakers: Row[]; tasks: Row[]; files: Row[]; comments: Row[]; sessions: Row[]; history: Row[] };

export function PeoplePanel({ role, mode = "people" }: { role: "organizer" | "speaker"; mode?: "people" | "tasks" | "portal" }) {
  const resource = useResource<PeopleData>("/api/speakers");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showSpeakerForm, setShowSpeakerForm] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [taskStatus, setTaskStatus] = useState("all");

  const visibleSpeakers = useMemo(() => (resource.data?.speakers ?? []).filter((speaker) =>
    (String(speaker.name).toLowerCase().includes(query.toLowerCase()) || String(speaker.company).toLowerCase().includes(query.toLowerCase())) &&
    (status === "all" || speaker.workflow_status === status)), [resource.data, query, status]);
  const activeSpeaker = resource.data?.speakers.find((speaker) => speaker.id === selectedSpeaker) ?? resource.data?.speakers[0];
  const visibleTasks = (resource.data?.tasks ?? []).filter((task) => taskStatus === "all" || task.status === taskStatus);

  async function run(path: string, body?: object) {
    const result = await apiRequest<{ message: string }>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
    setMessage(result.message); await resource.reload();
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    const form = new FormData(); form.set("file", file);
    const response = await fetch("/api/speakers/import", { method: "POST", body: form });
    const result = await response.json() as { message?: string; error?: string };
    setMessage(result.message ?? result.error ?? "Import finished."); await resource.reload();
  }

  async function uploadTask(taskId: string, file: File) {
    const form = new FormData(); form.set("file", file);
    const response = await fetch(`/api/speakers/tasks/${taskId}/upload`, { method: "POST", body: form });
    const result = await response.json() as { message?: string; error?: string };
    setMessage(result.message ?? result.error ?? "Upload finished."); await resource.reload();
  }

  if (resource.loading) return <LoadingBlock label="Loading speakers and deliverables…" />;
  if (resource.error) return <ErrorBlock message={resource.error} />;
  if (!resource.data) return null;

  if (role === "speaker" && mode === "portal") return activeSpeaker ? <SpeakerProfile speaker={activeSpeaker} sessions={resource.data.sessions}
    message={message} onSaved={async (text) => { setMessage(text); await resource.reload(); }} /> : <EmptyBlock title="No speaker profile">This account has no speaker record in the active event.</EmptyBlock>;

  if (role === "speaker" || mode === "tasks") return <div className="task-workspace">
    {message ? <Notice>{message}</Notice> : null}
    <section className="panel-card"><header className="section-toolbar"><div><p className="eyebrow">{role === "speaker" ? "My onboarding" : "Deliverables pipeline"}</p>
      <h2>{resource.data.tasks.filter((task) => task.status !== "complete").length} outstanding tasks</h2></div><div className="toolbar-actions"><select aria-label="Filter deliverable status" value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}><option value="all">All statuses</option><option value="incomplete">Incomplete</option><option value="submitted">Uploaded</option><option value="complete">Complete</option></select>
      {role === "organizer" ? <button className="button button-quiet" onClick={() => run("/api/speakers/remind")}><Mail size={15} /> Remind outstanding</button> : null}</div></header>
      <div className="task-list">{visibleTasks.map((task) => <article key={task.id}><div className="task-check">{task.status === "complete" ? <Check size={14} /> : null}</div>
        <div><strong>{task.title}</strong><small>{task.speaker_name} · due {formatDate(task.due_at)}{task.session_title ? ` · ${task.session_title}` : ""}</small>
          {task.description ? <p>{task.description}</p> : null}
          {task.task_type === "file_request" ? <p className="constraint-copy">Accepted: {task.accepted_types ?? "event files"} · Maximum {Math.round(Number(task.max_file_bytes ?? 0) / 1_048_576)} MB · {task.version_count} version{Number(task.version_count) === 1 ? "" : "s"}</p> : null}</div>
        <div className="task-actions"><StatusChip value={task.status} />{role === "speaker" && task.task_type === "file_request" ? <label className="button button-quiet button-small"><Upload size={14} /> Upload new version<input className="visually-hidden" type="file" accept={task.accepted_types ?? undefined} onChange={(event) => event.target.files?.[0] && uploadTask(String(task.id), event.target.files[0])} /></label> : null}
          {role === "speaker" && task.task_type !== "file_request" && task.status !== "complete" ? <button className="button button-quiet button-small" onClick={() => run(`/api/speakers/tasks/${task.id}/complete`)}>Mark complete</button> : null}
          {task.status === "complete" ? <button className="button button-quiet button-small" onClick={() => run(`/api/speakers/tasks/${task.id}/reopen`)}>Reopen</button> : null}</div></article>)}</div>
    </section>
    <section className="panel-card"><header className="section-toolbar"><div><p className="eyebrow">File library</p><h2>All versions stay attached to their task</h2></div><FileArchive size={18} /></header>
      {resource.data.files.length ? <div className="file-list">{resource.data.files.map((file) => <FileRecord key={String(file.id)} file={file} comments={(resource.data?.comments ?? []).filter((comment) => comment.file_id === file.id)} onAdded={async (text) => { setMessage(text); await resource.reload(); }} />)}</div> : <EmptyBlock title="No task deliverables yet">Files uploaded against a deliverable request appear here with version metadata. Profile photos are held on the speaker record and are listed below.</EmptyBlock>}
      <ProfilePhotoLibrary speakers={resource.data.speakers} />
    </section>
  </div>;

  return <div className="people-workspace">
    {message ? <Notice>{message}</Notice> : null}
    <section className="panel-card">
      <header className="section-toolbar"><div><p className="eyebrow">Speaker management</p><h2>{visibleSpeakers.length} speakers</h2></div><div className="toolbar-actions">
        <label className="button button-quiet button-small"><Upload size={14} /> Import CSV<input className="visually-hidden" type="file" accept=".csv,text/csv" onChange={importCsv} /></label>
        <button className="button button-quiet button-small" disabled={!visibleSpeakers.length}
          onClick={() => setShowCompose((value) => !value)}><Mail size={14} /> Email filtered</button>
        <button className="button button-quiet button-small" onClick={() => setShowSpeakerForm((value) => !value)}><UserPlus size={14} /> Add speaker</button>
        <button className="button button-accent button-small" onClick={() => setShowTaskForm((value) => !value)}><UserPlus size={14} /> Assign task</button></div></header>
      {showCompose ? <BulkEmailCompose recipients={visibleSpeakers}
        onSent={async (text) => { setMessage(text); setShowCompose(false); await resource.reload(); }}
        onCancel={() => setShowCompose(false)} /> : null}
      {showSpeakerForm ? <SpeakerCreateForm onAdded={async (text) => { setMessage(text); setShowSpeakerForm(false); await resource.reload(); }} /> : null}
      {showTaskForm ? <TaskForm speakerIds={visibleSpeakers.map((speaker) => String(speaker.id))} sessions={resource.data.sessions} onAdded={async (text) => { setMessage(text); setShowTaskForm(false); await resource.reload(); }} /> : null}
      <div className="filter-bar"><label className="search-control"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search speaker or company" /></label>
        <select aria-label="Filter by workflow status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All workflow statuses</option><option value="active">Active</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option></select></div>
      <div className="speaker-table data-table"><div className="table-row table-head"><span>Speaker</span><span>Status</span><span>Readiness</span><span>Sessions</span></div>
        {visibleSpeakers.map((speaker) => <button className={`table-row ${activeSpeaker?.id === speaker.id ? "selected" : ""}`} key={speaker.id} onClick={() => setSelectedSpeaker(String(speaker.id))}>
          <span><strong>{speaker.name}</strong><small>{speaker.title} · {speaker.company}</small></span><span><StatusChip value={speaker.workflow_status} /></span>
          <span><strong>{speaker.completed_tasks}/{speaker.task_count}</strong><small>tasks complete</small></span><span><strong>{speaker.session_count}</strong><small>assigned sessions</small></span></button>)}</div>
    </section>
    {activeSpeaker ? <SpeakerProfile speaker={activeSpeaker} sessions={resource.data.sessions.filter((item) => item.speaker_id === activeSpeaker.id)} message={null}
      organizer onSaved={async (text) => { setMessage(text); await resource.reload(); }} /> : null}
  </div>;
}

function FileRecord({ file, comments, onAdded }: { file: Row; comments: Row[]; onAdded: (message: string) => void }) {
  const [comment, setComment] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await apiRequest<{ message: string }>(`/api/speakers/files/${file.id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) });
    setComment(""); onAdded(result.message);
  }
  return <article className="file-record"><span><strong>{file.file_name}</strong><small>{file.speaker_name} · {file.task_title} · uploaded {formatDateTime(file.created_at)}</small></span>
    <span><StatusChip value={file.is_latest ? "latest" : `version ${file.version}`} /><a className="button button-quiet button-small" href={`/api/speakers/files/${file.id}`}>Download</a></span>
    <div className="file-comments">{comments.map((item) => <p key={item.id}><strong>{item.author_name}</strong> · {formatDateTime(item.created_at)}<br />{item.body}</p>)}
      <form onSubmit={submit}><label className="sr-only" htmlFor={`comment-${file.id}`}>Comment on {String(file.file_name)}</label><input id={`comment-${file.id}`} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a file comment" /><button className="button button-quiet button-small">Comment</button></form></div>
  </article>;
}

function SpeakerProfile({ speaker, sessions, organizer = false, onSaved, message }: { speaker: Row; sessions: Row[]; organizer?: boolean; onSaved: (message: string) => void; message: string | null }) {
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(String(speaker?.bio ?? ""));
  const [twitter, setTwitter] = useState(String(speaker?.twitter ?? ""));
  const [linkedinUrl, setLinkedin] = useState(String(speaker?.linkedin_url ?? ""));
  const [headshotUrl, setHeadshotUrl] = useState(String(speaker?.headshot_url ?? ""));
  const [workflowStatus, setWorkflowStatus] = useState(String(speaker?.workflow_status ?? "active"));
  const [organizerNote, setOrganizerNote] = useState(String(speaker?.organizer_note ?? ""));
  const [travelPreferences, setTravelPreferences] = useState(String(speaker?.travel_preferences ?? ""));
  const [dietaryPreferences, setDietaryPreferences] = useState(String(speaker?.dietary_preferences ?? ""));
  const [tshirtSize, setTshirtSize] = useState(String(speaker?.tshirt_size ?? ""));
  useEffect(() => {
    setBio(String(speaker?.bio ?? ""));
    setTwitter(String(speaker?.twitter ?? ""));
    setLinkedin(String(speaker?.linkedin_url ?? ""));
    setHeadshotUrl(String(speaker?.headshot_url ?? ""));
    setWorkflowStatus(String(speaker?.workflow_status ?? "active"));
    setOrganizerNote(String(speaker?.organizer_note ?? ""));
    setTravelPreferences(String(speaker?.travel_preferences ?? ""));
    setDietaryPreferences(String(speaker?.dietary_preferences ?? ""));
    setTshirtSize(String(speaker?.tshirt_size ?? ""));
  }, [speaker]);
  async function readHeadshot(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { onSaved("Choose an image file for the profile photo."); return; }
    if (file.size > 1_048_576) { onSaved("Profile photos must be 1 MB or smaller."); return; }
    const reader = new FileReader();
    reader.onload = () => setHeadshotUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await apiRequest<{ message: string }>(`/api/speakers/${speaker.id}`, { method: "PATCH",
      body: JSON.stringify({ bio, twitter, linkedinUrl, headshotUrl, travelPreferences, dietaryPreferences, tshirtSize,
        ...(organizer ? { workflowStatus, organizerNote } : {}) }) });
    setEditing(false); onSaved(result.message);
  }
  if (!speaker) return null;
  return <section className="panel-card profile-card">
    <header className="detail-heading"><div className="profile-heading"><span className="avatar avatar-large profile-photo">{speaker.headshot_url ? <img src={String(speaker.headshot_url)} alt={`${speaker.name} profile`} /> : String(speaker.name).split(" ").map((part) => part[0]).join("")}</span><div><p className="eyebrow">{organizer ? "Organizer speaker record" : "My speaker portal"}</p><h2>{speaker.name}</h2><p>{speaker.title} · {speaker.company}</p></div></div><div className="toolbar-actions">{organizer ? <button className="button button-quiet button-small" onClick={async () => { const result = await apiRequest<{ message: string }>(`/api/speakers/${speaker.id}/invite`, { method: "POST", body: JSON.stringify({}) }); onSaved(result.message); }}><Mail size={14} /> Invite to portal</button> : null}<button className="button button-quiet button-small" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel" : "Edit profile"}</button></div></header>
    {message ? <Notice>{message}</Notice> : null}
    {editing ? <form className="stack-form" onSubmit={submit}><label>Biography<textarea rows={6} value={bio} onChange={(event) => setBio(event.target.value)} /></label>
      <label>Social handle<input value={twitter} onChange={(event) => setTwitter(event.target.value)} /></label><label>LinkedIn URL<input type="url" value={linkedinUrl} onChange={(event) => setLinkedin(event.target.value)} /></label>
      <label>Profile photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={readHeadshot} /></label>
      <label>Travel preferences<input value={travelPreferences} onChange={(event) => setTravelPreferences(event.target.value)} placeholder="Arrival timing, seating, accessibility needs" /></label>
      <div className="two-field-row"><label>Dietary preferences<input value={dietaryPreferences} onChange={(event) => setDietaryPreferences(event.target.value)} /></label>
        <label>T-shirt size<select value={tshirtSize} onChange={(event) => setTshirtSize(event.target.value)}><option value="">Not set</option><option>XS</option><option>S</option><option>M</option><option>L</option><option>XL</option><option>2XL</option></select></label></div>
      {headshotUrl ? <span className="avatar avatar-large profile-photo profile-photo-preview"><img src={headshotUrl} alt="New profile preview" /></span> : null}
      {organizer ? <><label>Workflow status<select value={workflowStatus} onChange={(event) => setWorkflowStatus(event.target.value)}><option value="active">Active</option><option value="invited">Invited</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option></select></label>
        <label>Organizer note<textarea rows={3} value={organizerNote} onChange={(event) => setOrganizerNote(event.target.value)} /></label></> : null}
      <button className="button button-accent">Save profile</button></form> : <div className="profile-body"><div><h3>Biography</h3><p>{speaker.bio}</p><dl className="record-facts"><div><dt>Social</dt><dd>{speaker.twitter || "Not added"}</dd></div><div><dt>LinkedIn</dt><dd>{speaker.linkedin_url || "Not added"}</dd></div><div><dt>Travel</dt><dd>{speaker.travel_preferences || "Not added"}</dd></div><div><dt>Dietary</dt><dd>{speaker.dietary_preferences || "Not added"}</dd></div></dl></div>
      <div>{organizer ? <><h3>Organizer controls</h3><div className="connection-card"><strong>Workflow status</strong><StatusChip value={speaker.workflow_status} />{speaker.organizer_note ? <small>{speaker.organizer_note}</small> : null}</div></> : null}<h3>Connected sessions</h3>{sessions.length ? sessions.map((item) => <article className="connection-card" key={item.id}><strong>{item.title}</strong><small>{item.track_name} · {item.format_name}</small><StatusChip value={item.content_status} /></article>) : <p className="muted-copy">No sessions assigned yet.</p>}</div></div>}
  </section>;
}

/**
 * Speaker profile photos, listed where an organizer looks for speaker uploads.
 *
 * A headshot is not a task deliverable — it lives on the speaker record rather than
 * in deliverable_files — so it never appeared in the file library and had no
 * download control anywhere. It is listed separately rather than folded in, because
 * calling it a deliverable would misrepresent what it is. No upload timestamp is
 * shown: the record does not store one, and users.updated_at moves on any profile
 * edit, so presenting it as an upload time would be inventing evidence.
 */
function ProfilePhotoLibrary({ speakers }: { speakers: Row[] }) {
  const withPhotos = speakers.filter((speaker) => String(speaker.headshot_url ?? "").startsWith("data:image/"));
  if (!withPhotos.length) return null;
  const extensionOf = (url: string) => (url.match(/^data:image\/(png|jpeg|webp)/)?.[1] ?? "png").replace("jpeg", "jpg");
  return <div className="profile-photo-library">
    <p className="eyebrow">Speaker profile photos · {withPhotos.length}</p>
    <ul>{withPhotos.map((speaker) => {
      const url = String(speaker.headshot_url);
      const fileName = `${String(speaker.name).toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-profile.${extensionOf(url)}`;
      return <li key={String(speaker.id)}>
        <img src={url} alt={`${String(speaker.name)} profile`} />
        <span><strong>{String(speaker.name)}</strong><small>{fileName}</small></span>
        <a className="button button-quiet button-small" href={url} download={fileName}>Download</a>
      </li>;
    })}</ul>
  </div>;
}

/**
 * Compose step for a speaker broadcast.
 *
 * This used to fire on click with a hard-coded subject and body, which is the one
 * thing the rest of the product refuses to do: every other outgoing path previews
 * exactly what will be written before an organizer commits to it. Recipients,
 * merge-field rendering, and the editable templates are all visible here first.
 */
function BulkEmailCompose({ recipients, onSent, onCancel }: {
  recipients: Row[]; onSent: (message: string) => void; onCancel: () => void;
}) {
  const templates = useResource<{ templates: Row[] }>("/api/publishing");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyTemplate(templateId: string) {
    const template = templates.data?.templates.find((item) => String(item.id) === templateId);
    if (!template) return;
    setSubject(String(template.subject ?? ""));
    setBody(String(template.body ?? ""));
  }

  // Rendered against the first recipient so the organizer reads a real message,
  // not a merge-field skeleton.
  const sample = recipients[0];
  const render = (text: string) => text.replaceAll("{speaker_name}", String(sample?.name ?? "speaker"));

  async function send() {
    setError(null); setPending(true);
    try {
      const result = await apiRequest<{ message: string }>("/api/speakers/bulk-email", {
        method: "POST",
        body: JSON.stringify({ speakerIds: recipients.map((speaker) => String(speaker.id)), subject, body }),
      });
      onSent(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The messages could not be queued.");
    } finally { setPending(false); }
  }

  return <section className="compose-panel">
    <header><div><p className="eyebrow">Compose broadcast</p><h3>{recipients.length} recipient{recipients.length === 1 ? "" : "s"}</h3></div>
      <button type="button" className="button button-quiet button-small" onClick={onCancel}>Cancel</button></header>

    <details className="recipient-disclosure"><summary>Review recipients</summary>
      <ul className="recipient-list">{recipients.map((speaker) => <li key={String(speaker.id)}>
        <strong>{String(speaker.name)}</strong> <span>{String(speaker.email ?? "no address on file")}</span></li>)}</ul>
    </details>

    <label>Start from a template
      <select defaultValue="" onChange={(event) => applyTemplate(event.target.value)}>
        <option value="">Write from scratch…</option>
        {(templates.data?.templates ?? []).map((template) => <option key={String(template.id)} value={String(template.id)}>{String(template.name)}</option>)}
      </select>
    </label>
    <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Use {speaker_name} to personalize" /></label>
    <label>Message<textarea rows={6} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Use {speaker_name} to personalize" /></label>

    {subject.trim() && body.trim() ? <div className="compose-preview">
      <p className="eyebrow">Preview for {String(sample?.name ?? "the first recipient")}</p>
      <p className="preview-subject">{render(subject)}</p>
      <p className="preview-body">{render(body)}</p>
    </div> : null}

    {error ? <Notice tone="warning">{error}</Notice> : null}
    <footer>
      <span>Messages are written to the outbox with a receipt for each recipient. This deployment does not deliver mail externally.</span>
      <button type="button" className="button button-accent button-small" disabled={pending || !subject.trim() || !body.trim()} onClick={send}>
        {pending ? "Queueing…" : `Queue ${recipients.length} message${recipients.length === 1 ? "" : "s"}`}</button>
    </footer>
  </section>;
}

function SpeakerCreateForm({ onAdded }: { onAdded: (message: string) => void }) {
  const [name, setName] = useState("Avery Chen"); const [email, setEmail] = useState("avery.chen@example.com");
  const [title, setTitle] = useState("Engineering Director"); const [company, setCompany] = useState("Helix Systems");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await apiRequest<{ message: string }>("/api/speakers", { method: "POST",
      body: JSON.stringify({ name, email, title, company, bio: `${name} is ${title} at ${company}.` }) });
    onAdded(result.message);
  }
  return <form className="inline-form" onSubmit={submit}><label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Company<input value={company} onChange={(event) => setCompany(event.target.value)} /></label><button className="button button-accent">Add to roster</button></form>;
}

function TaskForm({ speakerIds, sessions, onAdded }: { speakerIds: string[]; sessions: Row[]; onAdded: (message: string) => void }) {
  const sessionOptions = [...new Map(sessions.map((session) => [String(session.id), session])).values()];
  const [title, setTitle] = useState("Confirm travel details");
  const [dueAt, setDueAt] = useState("2027-04-15");
  const [taskType, setTaskType] = useState("action");
  const [sessionId, setSessionId] = useState(String(sessionOptions[0]?.id ?? ""));
  async function submit(event: FormEvent) {
    event.preventDefault(); const result = await apiRequest<{ message: string }>("/api/speakers/tasks", { method: "POST",
      body: JSON.stringify({ speakerIds, sessionId: sessionId || null, title, description: "Complete this item in your speaker portal.", dueAt, taskType,
        acceptedTypes: taskType === "file_request" ? ".pdf,.ppt,.pptx" : undefined, maxFileBytes: taskType === "file_request" ? 26214400 : undefined }) });
    onAdded(result.message);
  }
  return <form className="inline-form task-create-form" onSubmit={submit}><label>Task title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Due date<input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label><label>Session<select value={sessionId} onChange={(event) => setSessionId(event.target.value)}><option value="">General event task</option>{sessionOptions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}</select></label><label>Type<select value={taskType} onChange={(event) => setTaskType(event.target.value)}><option value="action">General action</option><option value="file_request">File request</option></select></label>
    <button className="button button-accent">Assign to {speakerIds.length} speakers</button></form>;
}
