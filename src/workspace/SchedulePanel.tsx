import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarCheck, Clock3, Lock, Plus, Sparkles, Unlock, Users } from "lucide-react";

import { apiRequest } from "../lib/api";
import { useResource } from "../lib/useResource";
import { EmptyBlock, ErrorBlock, formatDate, formatDateTime, LoadingBlock, Notice, Row, StatusChip } from "./shared";

type ScheduleData = { event: Row; rooms: Row[]; tracks: Row[]; formats: Row[]; revisions: Row[]; items: Row[]; sessions: Row[] };

export function SchedulePanel({ role }: { role: "organizer" | "speaker" }) {
  const resource = useResource<ScheduleData>("/api/schedule");
  const [message, setMessage] = useState<string | null>(null);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [placementSession, setPlacementSession] = useState<string | null>(null);
  const [showRoomForm, setShowRoomForm] = useState(false);

  useEffect(() => {
    if (!revisionId && resource.data?.revisions.length) {
      const revision = role === "organizer" ? resource.data.revisions.find((item) => item.status === "draft") ?? resource.data.revisions[0]
        : resource.data.revisions.find((item) => item.status === "published") ?? resource.data.revisions[0];
      setRevisionId(String(revision.id));
    }
    if (!day && resource.data?.event.starts_on) setDay(String(resource.data.event.starts_on));
  }, [resource.data, role, revisionId, day]);

  const days = useMemo(() => {
    if (!resource.data?.event) return [];
    const result: string[] = []; const current = new Date(`${resource.data.event.starts_on}T12:00:00`); const end = new Date(`${resource.data.event.ends_on}T12:00:00`);
    while (current <= end) { result.push(current.toISOString().slice(0, 10)); current.setDate(current.getDate() + 1); }
    return result;
  }, [resource.data]);
  const items = resource.data?.items.filter((item) => item.revision_id === revisionId && String(item.starts_at).slice(0, 10) === day) ?? [];
  const scheduledIds = new Set(resource.data?.items.filter((item) => item.revision_id === revisionId).map((item) => item.session_id) ?? []);
  const unscheduled = resource.data?.sessions.filter((session) => !scheduledIds.has(session.id)) ?? [];
  const activeRevision = resource.data?.revisions.find((item) => item.id === revisionId);
  const eventTimezone = String(resource.data?.event.timezone ?? "America/Los_Angeles");

  async function run(path: string, body?: object) {
    try {
      const result = await apiRequest<{ message: string }>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
      setMessage(result.message); await resource.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Schedule action failed."); }
  }

  function dragStart(event: DragEvent, sessionId: string) { event.dataTransfer.setData("text/session-id", sessionId); event.dataTransfer.effectAllowed = "move"; }
  function drop(event: DragEvent, roomId: string) {
    event.preventDefault(); const sessionId = event.dataTransfer.getData("text/session-id"); if (!sessionId || !day) return;
    const source = resource.data?.sessions.find((item) => item.id === sessionId);
    void run("/api/schedule/place", { sessionId, roomId, startsAt: `${day}T09:00:00-07:00`, durationMinutes: Number(source?.duration_minutes ?? 30), locked: false });
  }

  if (resource.loading) return <LoadingBlock label="Loading the schedule workbench…" />;
  if (resource.error) return <ErrorBlock message={resource.error} />;
  if (!resource.data) return null;

  return <div className="schedule-workspace">
    {message ? <Notice tone={message.toLowerCase().includes("conflict") ? "warning" : "success"}>{message}</Notice> : null}
    <section className="schedule-toolbar panel-card">
      <div><p className="eyebrow">Agenda workbench</p><h2>{role === "organizer" ? `Revision ${activeRevision?.version ?? "—"} · ${activeRevision?.status ?? "loading"}` : "My published schedule"}</h2>
        <p>{role === "organizer" ? "Draft changes are isolated until publish. Drag sessions between room columns or use precise placement." : "Only sessions assigned to your speaker account are shown."}</p></div>
      {role === "organizer" ? <div className="toolbar-actions"><button className="button button-quiet" onClick={() => run("/api/schedule/auto-place")}><Sparkles size={15} /> Auto-place unscheduled</button>
        <button className="button button-accent" onClick={() => run("/api/schedule/publish")}><CalendarCheck size={15} /> Publish this revision</button></div> : null}
    </section>

    <div className="agenda-controls"><div className="day-tabs" role="tablist" aria-label="Event days">{days.map((date, index) => <button key={date} role="tab" aria-selected={day === date} onClick={() => setDay(date)}><span>Day {index + 1}</span><strong>{formatDate(date, { weekday: "short", month: "short", day: "numeric" })}</strong></button>)}</div>
      {role === "organizer" ? <div className="revision-control"><span>View revision</span><select value={revisionId ?? ""} onChange={(event) => setRevisionId(event.target.value)}>{resource.data.revisions.map((revision) => <option key={revision.id} value={revision.id}>v{revision.version} · {revision.status}</option>)}</select></div> : null}</div>

    {role === "organizer" ? <aside className="unscheduled-tray panel-card"><header><div><p className="eyebrow">Unscheduled</p><h3>{unscheduled.length} sessions ready</h3></div><button className="button button-quiet button-small" onClick={() => setShowRoomForm((value) => !value)}><Plus size={14} /> Room / track</button></header>
      {showRoomForm ? <RoomTrackForm onAdded={async (text) => { setMessage(text); setShowRoomForm(false); await resource.reload(); }} /> : null}
      <div>{unscheduled.map((session) => <button draggable onDragStart={(event) => dragStart(event, String(session.id))} onClick={() => setPlacementSession(String(session.id))} key={session.id} className={placementSession === session.id ? "selected" : ""}>
        <span className="drag-handle" aria-hidden="true">⠿</span><span><strong>{session.title}</strong><small>{session.track_name} · {session.duration_minutes} min · {session.speaker_names}</small></span><StatusChip value={session.content_status} /></button>)}</div>
      {!unscheduled.length ? <p className="muted-copy">All sessions in this revision have a placement.</p> : null}
    </aside> : null}

    {role === "organizer" && placementSession ? <PlacementForm data={resource.data} sessionId={placementSession} day={day ?? resource.data.event.starts_on}
      onPlaced={async (text) => { setMessage(text); setPlacementSession(null); await resource.reload(); }} /> : null}

    <section className="agenda-board panel-card" aria-label="Schedule grid">
      <div className="time-gutter"><span>8 AM</span><span>9 AM</span><span>10 AM</span><span>11 AM</span><span>12 PM</span><span>1 PM</span><span>2 PM</span><span>3 PM</span><span>4 PM</span><span>5 PM</span></div>
      <div className="room-grid">{resource.data.rooms.map((room) => <section className="room-column" key={room.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, String(room.id))}>
        <header><strong>{room.name}</strong><small>{room.capacity ? `${room.capacity} seats` : "Capacity open"}</small></header>
        <div className="room-lane">{items.filter((item) => item.room_id === room.id).map((item) => {
          const start = new Date(String(item.starts_at));
          const localParts = new Intl.DateTimeFormat("en-US", { timeZone: eventTimezone, hour: "numeric", minute: "numeric", hour12: false }).formatToParts(start);
          const localHour = Number(localParts.find((part) => part.type === "hour")?.value ?? 8);
          const localMinute = Number(localParts.find((part) => part.type === "minute")?.value ?? 0);
          const top = Math.max(0, (localHour + localMinute / 60 - 8) * 5.25);
          const minutes = (new Date(String(item.ends_at)).getTime() - start.getTime()) / 60_000;
          return <article draggable={role === "organizer"} onDragStart={(event) => dragStart(event, String(item.session_id))} className="session-block" style={{ top: `${top}rem`, minHeight: `${Math.max(3.75, minutes / 60 * 5.25)}rem`, borderLeftColor: item.track_color }} key={item.id}>
            <div><span>{formatDateTime(item.starts_at).split(", ").at(-1)}–{formatDateTime(item.ends_at).split(", ").at(-1)}</span>{item.locked ? <Lock size={12} /> : <Unlock size={12} />}</div>
            <strong>{item.title}</strong><small>{item.track_name} · {item.format_name}</small><span><Users size={12} /> {item.speaker_names}</span>
            {item.override_reason ? <em>Override: {item.override_reason}</em> : null}</article>;
        })}</div>
      </section>)}</div>
      {!items.length ? <div className="agenda-empty"><Clock3 size={20} /><strong>No sessions on this day in revision {activeRevision?.version}.</strong><span>Drag an unscheduled session into a room or switch days.</span></div> : null}
    </section>
  </div>;
}

function PlacementForm({ data, sessionId, day, onPlaced }: { data: ScheduleData; sessionId: string; day: string; onPlaced: (message: string) => void }) {
  const session = data.sessions.find((item) => item.id === sessionId)!;
  const [roomId, setRoomId] = useState(String(data.rooms[0]?.id ?? ""));
  const [startsAt, setStartsAt] = useState(`${day}T10:00`);
  const [duration, setDuration] = useState(Number(session.duration_minutes ?? data.event.default_session_minutes));
  const [lock, setLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    try { const result = await apiRequest<{ message: string }>("/api/schedule/place", { method: "POST",
      body: JSON.stringify({ sessionId, roomId, startsAt: `${startsAt}:00-07:00`, durationMinutes: duration, locked: lock }) }); onPlaced(result.message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Placement failed."); }
  }
  return <form className="placement-form panel-card" onSubmit={submit}><div><p className="eyebrow">Precise placement</p><h3>{session.title}</h3><p>Drag-to-resize equivalent: set the exact duration here; move by changing room or start time.</p></div>
    <label>Room<select value={roomId} onChange={(event) => setRoomId(event.target.value)}>{data.rooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}</select></label>
    <label>Start<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
    <label>Duration<input type="number" min="5" step="5" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
    <label className="check-label"><input type="checkbox" checked={lock} onChange={(event) => setLock(event.target.checked)} /> Lock placement</label>
    <button className="button button-accent">Save to draft</button>{error ? <Notice tone="warning">{error}</Notice> : null}</form>;
}

function RoomTrackForm({ onAdded }: { onAdded: (message: string) => void }) {
  const [kind, setKind] = useState("room"); const [name, setName] = useState("Studio B");
  async function submit(event: FormEvent) { event.preventDefault(); const result = await apiRequest<{ message: string }>(`/api/schedule/${kind === "room" ? "rooms" : "tracks"}`, { method: "POST",
    body: JSON.stringify(kind === "room" ? { name, capacity: 160 } : { name, color: "#b54f2f" }) }); onAdded(result.message); }
  return <form className="inline-form" onSubmit={submit}><label>Resource<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="room">Room</option><option value="track">Track</option></select></label>
    <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label><button className="button button-accent button-small">Add and use now</button></form>;
}
