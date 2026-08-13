import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarPlus, ChevronLeft, ChevronRight, Clock3, ExternalLink, MapPin, Search, Star, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../lib/api";
import { useResource } from "../lib/useResource";
import { ErrorBlock, formatDate, formatDateTime, LoadingBlock, Notice, Row, StatusChip } from "../workspace/shared";

type PublicData = { event: Row; form: Row | null; fields: Row[]; tracks: Row[]; formats: Row[]; sessions: Row[]; speakers: Row[]; embedConfig?: Record<string, unknown> | null };
const publicNav = [["sessions", "Sessions"], ["speakers", "Speakers"], ["agenda", "Agenda"], ["itinerary", "Itinerary"], ["gallery", "Speaker gallery"], ["cfp", "Submit a talk"]] as const;

export function PublicEvent() {
  const { slug = "devflow-conf-2027", surface = "agenda" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const embedToken = new URLSearchParams(location.search).get("embed");
  const resource = useResource<PublicData>(`/api/public/${slug}${embedToken ? `?embed=${encodeURIComponent(embedToken)}` : ""}`);
  if (resource.loading) return <LoadingBlock label="Loading the public program…" />;
  if (resource.error) return <ErrorBlock message={resource.error} />;
  if (!resource.data) return null;

  // A saved embed can be scoped to one track. Apply it once here so every surface
  // renders the same slice, and narrow the speaker directory to the people still
  // appearing — a filtered agenda beside an unfiltered speaker list is its own lie.
  const embedTrack = String(resource.data.embedConfig?.track ?? "").trim();
  const data = embedTrack && embedTrack !== "all"
    ? (() => {
        const sessions = resource.data.sessions.filter((session) => session.track_name === embedTrack);
        const speakerIds = new Set(sessions.flatMap((session) => String(session.speaker_ids ?? "").split("||")).filter(Boolean));
        return { ...resource.data, sessions, speakers: resource.data.speakers.filter((speaker) => speakerIds.has(String(speaker.id))) };
      })()
    : resource.data;
  return <div className="public-shell">
    <header className="public-header"><div className="public-brand"><Link className="wordmark" to="/">Event Manager OS</Link><span /><Link to={`/events/${slug}/agenda`}><strong>{resource.data.event.name}</strong><small>{formatDate(resource.data.event.starts_on)}–{formatDate(resource.data.event.ends_on)} · {resource.data.event.location}</small></Link></div>
      <Link className="button button-quiet button-small" to="/login">Organizer / participant sign in</Link></header>
    <nav className="public-nav" aria-label="Public event pages">{publicNav.map(([id, label]) => <button key={id} aria-current={surface === id ? "page" : undefined} onClick={() => navigate(`/events/${slug}/${id}`)}>{label}</button>)}</nav>
    <main className="public-main">
      {surface === "cfp" ? <PublicCfp data={data} slug={slug} /> : null}
      {surface === "sessions" ? <SessionsSurface data={data} /> : null}
      {surface === "speakers" ? <SpeakersSurface data={data} gallery={false} /> : null}
      {surface === "gallery" || surface === "speaker_gallery" ? <SpeakersSurface data={data} gallery /> : null}
      {surface === "agenda" ? <AgendaSurface data={data} /> : null}
      {surface === "itinerary" ? <ItinerarySurface data={data} slug={slug} /> : null}
    </main>
    <footer className="public-footer"><span>Published from one approved Event Manager OS record.</span><Link to="/">Powered by Event Manager OS <ExternalLink size={12} /></Link></footer>
  </div>;
}

function PublicHero({ data, eyebrow, title, support }: { data: PublicData; eyebrow: string; title: string; support: string }) {
  return <header className="public-hero"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{support}</p><div><span><Clock3 size={14} /> {formatDate(data.event.starts_on)}–{formatDate(data.event.ends_on)}</span><span><MapPin size={14} /> {data.event.location}</span></div></header>;
}

function PublicCfp({ data, slug }: { data: PublicData; slug: string }) {
  const closed = !data.form || data.form.status !== "published" || (data.form.closes_at && new Date(String(data.form.closes_at)).getTime() < Date.now());
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState(""); const [trackId, setTrackId] = useState(""); const [formatId, setFormatId] = useState("");
  const [audience, setAudience] = useState(""); const [keyTakeaway, setKey] = useState(""); const [prerequisites, setPrerequisites] = useState("");
  const [speakerBio, setSpeakerBio] = useState(""); const [notesForReviewers, setNotes] = useState("");
  const [coSpeakers, setCoSpeakers] = useState<CoSpeakerEntry[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [message, setMessage] = useState<string | null>(null); const [showSignup, setShowSignup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const selectedFormat = data.formats.find((format) => format.id === formatId)?.name;
  const selectedTrack = data.tracks.find((track) => track.id === trackId)?.name;
  const coreFieldKeys = new Set(["title", "abstract", "track", "format", "audience", "speaker_bio", "key_takeaway", "workshop_prerequisites"]);
  const customFields = data.fields.filter((field) => !coreFieldKeys.has(String(field.field_key))).filter((field) => {
    if (!field.condition_field_key) return true;
    const actual = field.condition_field_key === "format" ? selectedFormat
      : field.condition_field_key === "track" ? selectedTrack
        : answers[String(data.fields.find((candidate) => candidate.field_key === field.condition_field_key)?.id ?? "")];
    return String(actual ?? "") === String(field.condition_value ?? "");
  });

  async function submit(status: "draft" | "submitted") {
    // Without this guard a double-click posts twice and leaves two identical
    // draft rows in both the speaker's dashboard and the organizer's list.
    if (submitting) return;
    setSubmitting(true);
    try { const result = await apiRequest<{ message: string }>(`/api/public/${slug}/proposals`, { method: "POST",
      body: JSON.stringify({ title, abstract, trackId: trackId || null, formatId: formatId || null, audienceLevel: audience,
        notesForReviewers, speakerBio, keyTakeaway, coSpeakers: completedCoSpeakers(coSpeakers),
        workshopPrerequisites: prerequisites, answers, status }) }); setMessage(result.message); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Submission failed."); }
    finally { setSubmitting(false); }
  }

  return <div className="cfp-page"><PublicHero data={data} eyebrow="Call for speakers" title="Bring the talk only you can give." support={String(data.event.description)} />
    <section className="cfp-deadline"><span><strong>Submission deadline</strong><small>{data.form?.closes_at ? formatDate(data.form.closes_at, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "To be announced"}</small></span><StatusChip value={closed ? "submissions closed" : "accepting proposals"} /></section>
    {closed ? <section className="closed-state"><CalendarPlus size={26} /><h2>Submissions are closed</h2><p>The deadline has passed. Existing submitters can still sign in to view their decisions, but editing is locked.</p><Link className="button button-quiet" to="/login">View my submissions</Link></section> : <div className="cfp-layout">
      <form className="public-form" onSubmit={(event) => { event.preventDefault(); void submit("submitted"); }}><div><p className="eyebrow">Proposal form</p><h2>Tell the program committee what attendees will learn.</h2><p>Required fields are marked. You can save a title-only draft and return before the deadline.</p></div>
        <label>Session title <em>Required</em><input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Abstract <em>Required</em><textarea required rows={8} value={abstract} onChange={(event) => setAbstract(event.target.value)} placeholder="What problem will this session solve, and what evidence will you share?" /></label>
        <div className="two-field-row"><label>Track <em>Required</em><select required value={trackId} onChange={(event) => setTrackId(event.target.value)}><option value="">Choose a track…</option>{data.tracks.map((track) => <option value={track.id} key={track.id}>{track.name}</option>)}</select></label>
          <label>Session format <em>Required</em><select required value={formatId} onChange={(event) => setFormatId(event.target.value)}><option value="">Choose a format…</option>{data.formats.map((format) => <option value={format.id} key={format.id}>{format.name}</option>)}</select></label></div>
        <label>Audience level <em>Required</em><select required value={audience} onChange={(event) => setAudience(event.target.value)}><option value="">Choose an audience level…</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
        <label>Speaker bio <em>Required</em><textarea required rows={4} value={speakerBio} onChange={(event) => setSpeakerBio(event.target.value)} placeholder="The background that makes you the right person to give this talk." /></label>
        <label>Notes for reviewers<textarea rows={3} value={notesForReviewers} onChange={(event) => setNotes(event.target.value)} placeholder="Anything the committee should know that does not belong in the public abstract." /></label>
        <CoSpeakerFields value={coSpeakers} onChange={setCoSpeakers} />
        <label>Key takeaway <em>Required</em><input required value={keyTakeaway} onChange={(event) => setKey(event.target.value)} placeholder="A decision framework attendees can apply immediately" /></label>
        {selectedFormat === "Workshop (120 min)" ? <label className="conditional-field">Workshop prerequisites <span>Shown because Workshop is selected</span><textarea rows={4} value={prerequisites} onChange={(event) => setPrerequisites(event.target.value)} /></label> : null}
        {customFields.map((field) => <label className={field.condition_field_key ? "conditional-field" : undefined} key={field.id}>{field.label} {field.required ? <em>Required</em> : null}{field.help_text ? <span>{field.help_text}</span> : null}
          {field.field_type === "long_text" ? <textarea rows={4} required={Boolean(field.required)} value={answers[String(field.id)] ?? ""} onChange={(event) => setAnswers({ ...answers, [String(field.id)]: event.target.value })} />
            : field.field_type === "select" || field.field_type === "multi_select" ? <select required={Boolean(field.required)} value={answers[String(field.id)] ?? ""} onChange={(event) => setAnswers({ ...answers, [String(field.id)]: event.target.value })}><option value="">Choose…</option>{JSON.parse(String(field.options_json ?? "[]")).map((option: string) => <option key={option}>{option}</option>)}</select>
              : <input type={field.field_type === "number" ? "number" : "text"} required={Boolean(field.required)} value={answers[String(field.id)] ?? ""} onChange={(event) => setAnswers({ ...answers, [String(field.id)]: field.field_type === "number" ? Number(event.target.value) : event.target.value })} />}
        </label>)}
        <div className="form-actions"><button type="button" className="button button-quiet" disabled={submitting} onClick={() => submit("draft")}>{submitting ? "Saving…" : "Save as draft"}</button><button className="button button-accent" disabled={submitting}>{submitting ? "Submitting…" : "Submit proposal"}</button></div>
        {message ? <Notice tone={message.toLowerCase().includes("required") || message.toLowerCase().includes("sign in") ? "warning" : "success"}>{message}</Notice> : null}
      </form>
      <aside className="cfp-aside"><h3>Submitter access</h3><p>Sign in to save drafts, submit, edit while the call is open, and track committee decisions.</p><Link className="button button-ink" to="/login">Sign in as a speaker</Link><button className="button button-quiet" onClick={() => setShowSignup((value) => !value)}>Create submitter account</button>
        {showSignup ? <SignupForm slug={slug} onCreated={(text) => { setMessage(text); setShowSignup(false); }} /> : null}<hr /><h3>Configured options</h3><dl><div><dt>Tracks</dt><dd>{data.tracks.map((item) => item.name).join(" · ")}</dd></div><div><dt>Formats</dt><dd>{data.formats.map((item) => item.name).join(" · ")}</dd></div></dl></aside>
    </div>}
  </div>;
}

export type CoSpeakerEntry = { name: string; email: string };

/**
 * Co-presenter rows. A talk often has more than one presenter, and the speaker who
 * submits it is the one who knows who they are — this is shared by the public form
 * and the logged-in edit panel so both offer the same control.
 */
export function CoSpeakerFields({ value, onChange }: { value: CoSpeakerEntry[]; onChange: (next: CoSpeakerEntry[]) => void }) {
  function update(index: number, patch: Partial<CoSpeakerEntry>) {
    onChange(value.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)));
  }
  return <fieldset className="co-speaker-fields">
    <legend>Co-presenters</legend>
    <p className="field-help">Anyone presenting this session with you. They are added to the program and can be invited to their own portal; leave empty if you are presenting alone.</p>
    {value.map((entry, index) => <div className="co-speaker-row" key={index}>
      <label>Name<input value={entry.name} onChange={(event) => update(index, { name: event.target.value })} /></label>
      <label>Email<input type="email" value={entry.email} onChange={(event) => update(index, { email: event.target.value })} /></label>
      <button type="button" className="button button-quiet button-small"
        onClick={() => onChange(value.filter((_, position) => position !== index))}>Remove</button>
    </div>)}
    <button type="button" className="button button-quiet button-small"
      onClick={() => onChange([...value, { name: "", email: "" }])}>Add a co-presenter</button>
  </fieldset>;
}

/** Rows the speaker actually filled in; blank rows are ignored rather than rejected. */
export function completedCoSpeakers(entries: CoSpeakerEntry[]) {
  return entries.filter((entry) => entry.name.trim() && entry.email.trim());
}

function SignupForm({ slug, onCreated }: { slug: string; onCreated: (message: string) => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [title, setTitle] = useState(""); const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setPending(true);
    try {
      const result = await apiRequest<{ message: string }>(`/api/public/${slug}/signup`, { method: "POST",
        body: JSON.stringify({ name, email, password, title, company, bio: "" }) });
      onCreated(result.message);
    } catch (reason) {
      // Without this the request simply rejected and the panel sat there looking idle.
      setError(reason instanceof Error ? reason.message : "The account could not be created.");
    } finally { setPending(false); }
  }
  return <form className="signup-form" onSubmit={submit}>
    <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>Password<input minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Company<input value={company} onChange={(event) => setCompany(event.target.value)} /></label>
    <button className="button button-accent button-small" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
    {error ? <Notice tone="warning">{error}</Notice> : null}
  </form>;
}

function SessionsSurface({ data }: { data: PublicData }) {
  const [query, setQuery] = useState(""); const [track, setTrack] = useState("all"); const [expanded, setExpanded] = useState<string | null>(null);
  const sessions = data.sessions.filter((session) => (track === "all" || session.track_name === track) && (`${session.title} ${session.speaker_names}`).toLowerCase().includes(query.toLowerCase()));
  return <><PublicHero data={data} eyebrow="Sessions list" title="Ideas worth putting on your calendar." support="Search every approved session by topic or speaker, then filter by track." />
    <div className="public-filters"><label className="search-control"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions or speakers" /></label><label>Filters<select value={track} onChange={(event) => setTrack(event.target.value)}><option value="all">All tracks</option>{data.tracks.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><strong>{sessions.length} results</strong></div>
    <section className="session-card-grid">{sessions.map((session) => <article key={session.id}><div className="card-tags"><span>{session.track_name}</span><span>{session.format_name}</span></div><h2>{session.title}</h2><p>{expanded === session.id ? session.description : `${String(session.description).slice(0, 145)}${String(session.description).length > 145 ? "…" : ""}`}</p>{String(session.description).length > 145 ? <button className="text-button" onClick={() => setExpanded(expanded === session.id ? null : String(session.id))}>{expanded === session.id ? "Show less" : "Show more"}</button> : null}
      <dl><div><dt>Date and time</dt><dd>{formatDateTime(session.starts_at)}–{formatDateTime(session.ends_at).split(", ").at(-1)}</dd></div><div><dt>Room</dt><dd>{session.room_name}</dd></div><div><dt>Speakers</dt><dd>{splitJoined(session.speaker_names).map((name, index) => <span key={name}>{name} · {splitJoined(session.speaker_titles)[index]}, {splitJoined(session.speaker_companies)[index]}</span>)}</dd></div></dl></article>)}</section></>;
}

function SpeakersSurface({ data, gallery }: { data: PublicData; gallery: boolean }) {
  const [query, setQuery] = useState(""); const [selected, setSelected] = useState<Row | null>(null);
  const speakers = data.speakers.filter((speaker) => String(speaker.name).toLowerCase().includes(query.toLowerCase()));
  const sessionFor = (speakerId: string) => data.sessions.filter((session) => splitJoined(session.speaker_ids).includes(speakerId));
  return <><PublicHero data={data} eyebrow={gallery ? "Speaker gallery" : "Speakers list"} title="Meet the people behind the program." support="Search the published speaker directory and open any profile for biography and session details." />
    <div className="public-filters"><label className="search-control"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by speaker name" /></label><strong>{speakers.length} speakers · alphabetized by surname</strong></div>
    <section className={gallery ? "speaker-gallery" : "speaker-directory"}>{speakers.map((speaker) => <button key={speaker.id} onClick={() => setSelected(speaker)}><span className={gallery ? "speaker-photo" : "avatar avatar-large"}>{speaker.headshot_url ? <img src={speaker.headshot_url} alt="" /> : String(speaker.name).split(" ").map((part) => part[0]).join("")}</span><span><strong>{speaker.name}</strong><small>{speaker.title}</small><small>{speaker.company}</small></span><ChevronRight size={16} /></button>)}</section>
    {selected ? <div className="public-modal" role="dialog" aria-modal="true" aria-label={`${selected.name} speaker detail`}><button className="modal-backdrop" aria-label="Close speaker detail" onClick={() => setSelected(null)} /><article><header><button className="text-button" onClick={() => setSelected(null)}><ArrowLeft size={14} /> Back to speakers</button><span className="avatar avatar-large profile-photo">{selected.headshot_url ? <img src={String(selected.headshot_url)} alt={`${selected.name} profile`} /> : String(selected.name).split(" ").map((part) => part[0]).join("")}</span><h2>{selected.name}</h2><p>{selected.title} · {selected.company}</p></header><section><h3>Biography</h3><p>{selected.bio}</p><h3>Sessions ({sessionFor(String(selected.id)).length})</h3>{sessionFor(String(selected.id)).map((session) => <article className="connection-card" key={session.id}><strong>{session.title}</strong><small>{formatDateTime(session.starts_at)} · {session.room_name}</small></article>)}</section></article></div> : null}</>;
}

function AgendaSurface({ data }: { data: PublicData }) {
  const days = eventDays(String(data.event.starts_on), String(data.event.ends_on)); const [dayIndex, setDayIndex] = useState(0); const [selected, setSelected] = useState<Row | null>(null);
  const day = days[dayIndex]; const sessions = data.sessions.filter((session) => String(session.starts_at).slice(0, 10) === day);
  // Room columns come from the whole published program, not the selected day: a
  // day with nothing scheduled still shows the venue's rooms and says so, instead
  // of collapsing to a bare time gutter that reads as a rendering failure.
  const rooms = [...new Set(data.sessions.map((item) => String(item.room_name)))];
  return <><PublicHero data={data} eyebrow="Agenda" title="The program, room by room." support="Navigate event days, scan the time grid, and open a session for full published details." />
    <div className="agenda-day-nav"><button disabled={dayIndex === 0} onClick={() => setDayIndex((value) => value - 1)}><ChevronLeft size={17} /> Previous day</button><strong>Day {dayIndex + 1} · {formatDate(day, { weekday: "long", month: "long", day: "numeric" })}</strong><button disabled={dayIndex >= days.length - 1} onClick={() => setDayIndex((value) => value + 1)}>Next day <ChevronRight size={17} /></button></div>
    {sessions.length === 0 ? <p className="empty-day-note">No published sessions are scheduled on this day yet. Sessions appear here when a schedule revision placing them is published.</p> : null}
    <section className="public-agenda" style={{ gridTemplateColumns: `4rem repeat(${Math.max(rooms.length, 1)}, minmax(13rem, 1fr))` }}><div className="agenda-time-col">{["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"].map((time) => <span key={time}>{time}</span>)}</div>{rooms.map((room) => <section key={room}><header>{room}</header><div>{sessions.filter((item) => item.room_name === room).map((session) => {
      const start = new Date(String(session.starts_at));
      const localParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(start);
      const hour = Number(localParts.find((part) => part.type === "hour")?.value ?? 8);
      const minute = Number(localParts.find((part) => part.type === "minute")?.value ?? 0);
      const duration = (new Date(String(session.ends_at)).getTime() - start.getTime()) / 60_000;
      return <button style={{ borderLeftColor: session.track_color, top: `${Math.max(0, (hour + minute / 60 - 8) * 5)}rem`, minHeight: `${Math.max(3.6, duration / 60 * 5)}rem` }} key={session.id} onClick={() => setSelected(session)}><small>{formatDateTime(session.starts_at).split(", ").at(-1)}</small><strong>{session.title}</strong><span>{session.track_name} · {session.format_name}</span></button>;
    })}</div></section>)}</section>
    {selected ? <SessionModal session={selected} onClose={() => setSelected(null)} /> : null}</>;
}

function ItinerarySurface({ data, slug }: { data: PublicData; slug: string }) {
  const storageKey = `program-desk:${slug}:personal-schedule`; const [selected, setSelected] = useState<string[]>(() => JSON.parse(localStorage.getItem(storageKey) ?? "[]")); const [onlyMine, setOnlyMine] = useState(false);
  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(selected)), [selected, storageKey]);
  const sessions = onlyMine ? data.sessions.filter((item) => selected.includes(String(item.id))) : data.sessions;
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  // A three-day event browsed as one flat list forces the reader to parse each
  // card's date label; grouping under explicit day sections keeps the chronology
  // and gives day-by-day navigation.
  const days = eventDays(String(data.event.starts_on), String(data.event.ends_on));
  const byDay = days.map((day) => ({ day, sessions: sessions.filter((session) => String(session.starts_at).slice(0, 10) === day) }));
  const undated = sessions.filter((session) => !days.includes(String(session.starts_at).slice(0, 10)));
  return <><PublicHero data={data} eyebrow="Schedule itinerary" title="Build your path through DevFlow." support="Sessions stay chronological. Add any talk to a persistent personal schedule and export it to your calendar." />
    <div className="itinerary-controls"><div className="segmented-control"><button aria-pressed={!onlyMine} onClick={() => setOnlyMine(false)}>All sessions</button><button aria-pressed={onlyMine} onClick={() => setOnlyMine(true)}>My schedule ({selected.length})</button></div>
      <nav className="day-jump" aria-label="Event days">{byDay.map(({ day, sessions: daySessions }, index) => <a key={day} href={`#itinerary-day-${index + 1}`} className={daySessions.length ? "" : "empty-day"}>Day {index + 1}</a>)}</nav>
      <a className="button button-quiet" href={`/api/public/${slug}/feed/itinerary?format=ical&ids=${encodeURIComponent(selected.join(","))}`}><CalendarPlus size={15} /> Export calendar (.ics)</a></div>
    {byDay.map(({ day, sessions: daySessions }, index) => <section className="itinerary-day" key={day} id={`itinerary-day-${index + 1}`}>
      <h2 className="day-heading"><span>Day {index + 1}</span>{formatDate(day, { weekday: "long", month: "long", day: "numeric" })}</h2>
      {daySessions.length ? <div className="itinerary-list">{daySessions.map((session) => <article key={session.id}><time>{formatDate(session.starts_at, { weekday: "short", month: "short", day: "numeric" })}<strong>{formatDateTime(session.starts_at).split(", ").at(-1)}–{formatDateTime(session.ends_at).split(", ").at(-1)}</strong></time><div><span className="track-label">{session.track_name}</span><span className="format-label">{session.format_name}</span><h2>{session.title}</h2><p>{session.description}</p><small>{session.room_name} · {splitJoined(session.speaker_names).map((name, speakerIndex) => `${name}, ${splitJoined(session.speaker_titles)[speakerIndex]} at ${splitJoined(session.speaker_companies)[speakerIndex]}`).join(" · ")}</small></div>
        <button className={`star-button ${selected.includes(String(session.id)) ? "selected" : ""}`} onClick={() => toggle(String(session.id))}><Star size={17} /> {selected.includes(String(session.id)) ? "Added" : "Add"}</button></article>)}</div>
        : <p className="empty-day-note">{onlyMine ? "Nothing from your schedule falls on this day." : "No published sessions are scheduled on this day yet."}</p>}
    </section>)}
    {undated.length ? <section className="itinerary-day"><h2 className="day-heading"><span>Unscheduled</span>Sessions without a published time</h2><div className="itinerary-list">{undated.map((session) => <article key={session.id}><div><span className="track-label">{session.track_name}</span><h2>{session.title}</h2></div></article>)}</div></section> : null}</>;
}

function SessionModal({ session, onClose }: { session: Row; onClose: () => void }) {
  return <div className="public-modal" role="dialog" aria-modal="true"><button className="modal-backdrop" aria-label="Close session detail" onClick={onClose} /><article><header><button className="text-button" onClick={onClose}><ArrowLeft size={14} /> Back to agenda</button><div className="card-tags"><span>{session.track_name}</span><span>{session.format_name}</span></div><h2>{session.title}</h2></header><section><dl><div><dt>Full time</dt><dd>{formatDateTime(session.starts_at)}–{formatDateTime(session.ends_at).split(", ").at(-1)}</dd></div><div><dt>Room</dt><dd>{session.room_name}</dd></div><div><dt>Speakers</dt><dd>{splitJoined(session.speaker_names).join(", ")}</dd></div></dl><h3>Description</h3><p>{session.description}</p></section></article></div>;
}

function splitJoined(value: unknown) { return String(value ?? "").split("||").filter(Boolean); }

function eventDays(startsOn: string, endsOn: string) {
  const days: string[] = [];
  const current = new Date(`${startsOn}T12:00:00Z`);
  const end = new Date(`${endsOn}T12:00:00Z`);
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}
