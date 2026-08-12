import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ArrowRight, Download, ExternalLink, Search, Share2, Sparkles, UserRoundCheck } from "lucide-react";

import { apiRequest } from "../lib/api";
import { useResource } from "../lib/useResource";
import { CoSpeakerFields, completedCoSpeakers, type CoSpeakerEntry } from "../screens/PublicEvent";
import { EmptyBlock, ErrorBlock, LoadingBlock, Notice, Row, StatusChip } from "./shared";

type ProposalList = { proposals: Row[] };
type ProposalDetail = { proposal: Row; participants: Row[]; answers?: Row[]; assignments: Row[]; reviewValues?: Row[]; research: Row | null; ai: Row | null; decisions: Row[] };

export function ProposalsPanel({ role, eventSlug }: { role: "organizer" | "speaker"; eventSlug: string }) {
  const list = useResource<ProposalList>("/api/proposals");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useResource<ProposalDetail>(selectedId ? `/api/proposals/${selectedId}` : null);
  const [query, setQuery] = useState("");
  const [sortScore, setSortScore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!selectedId && list.data?.proposals[0]) setSelectedId(String(list.data.proposals[0].id));
  }, [list.data, selectedId]);

  const rows = useMemo(() => {
    const filtered = (list.data?.proposals ?? []).filter((item) => String(item.title).toLowerCase().includes(query.toLowerCase()) ||
      String(item.submitter_name).toLowerCase().includes(query.toLowerCase()));
    return sortScore ? [...filtered].sort((a, b) => Number(b.aggregate_score ?? -1) - Number(a.aggregate_score ?? -1)) : filtered;
  }, [list.data, query, sortScore]);

  async function decide(disposition: "accepted" | "rejected" | "waitlisted" | "changes_requested") {
    if (!selectedId) return;
    const result = await apiRequest<{ message: string }>(`/api/proposals/${selectedId}/decision`, {
      method: "POST", body: JSON.stringify({ disposition, rationale: "Program fit, review evidence, and slate balance considered.", notify: true }),
    });
    setMessage(result.message);
    await Promise.all([list.reload(), detail.reload()]);
  }

  async function share() {
    if (!selectedId) return;
    const result = await apiRequest<{ url: string }>(`/api/proposals/${selectedId}/share`, {
      method: "POST", body: JSON.stringify({ email: "guest-advisor@example.com", canComment: true }),
    });
    setMessage(`Read-only share created: ${result.url}`);
  }

  async function overrideAi() {
    if (!selectedId) return;
    const result = await apiRequest<{ message: string }>(`/api/reviews/ai/${selectedId}/override`, { method: "POST",
      body: JSON.stringify({ disposition: "hold", reason: "Human committee judgment requires a slate-balance discussion." }) });
    setMessage(result.message); await detail.reload();
  }

  if (list.loading) return <LoadingBlock label="Loading proposals…" />;
  if (list.error) return <ErrorBlock message={list.error} />;

  return <div className="split-workspace">
    <section className="list-panel">
      <header className="section-toolbar">
        <div><p className="eyebrow">{role === "organizer" ? "Proposal operations" : "Submitter dashboard"}</p>
          <h2>{role === "organizer" ? `${rows.length} submissions` : "My submissions"}</h2></div>
        <div className="toolbar-actions">
          {role === "organizer" ? <>
            <a className="button button-quiet button-small" href="/api/proposals/export.csv"><Download size={14} /> Export CSV</a>
            <button className="button button-quiet button-small" onClick={() => setSortScore((value) => !value)}><ArrowDownUp size={14} /> Score</button>
          </> : <a className="button button-accent button-small" href={`/events/${eventSlug}/cfp`}>New submission <ArrowRight size={14} /></a>}
        </div>
      </header>
      <label className="search-control"><Search size={15} /><span className="sr-only">Search submissions</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search proposals or speakers" /></label>
      <div className="data-table proposal-table" role="table" aria-label="Submissions list">
        <div className="table-row table-head" role="row"><span>Submission</span><span>Track</span><span>Progress</span><span>Score</span></div>
        {rows.map((item) => <button type="button" className={`table-row ${selectedId === item.id ? "selected" : ""}`} role="row" key={item.id} onClick={() => { setSelectedId(String(item.id)); setEditing(false); }}>
          <span><strong>{item.title}</strong><small>{item.submitter_name}</small></span>
          <span>{item.track_name ?? "Unassigned"}<small>{item.format_name}</small></span>
          <span><StatusChip value={item.status} /><small>{item.completed_reviews}/{item.assignment_count} reviews</small></span>
          <span><strong>{item.aggregate_score ?? "—"}</strong><small>{item.ai_override_disposition
            ? `${item.ai_override_disposition} · human override`
            : item.ai_disposition ? `AI: ${item.ai_disposition}` : "No AI advice"}</small></span>
        </button>)}
      </div>
      {!rows.length ? <EmptyBlock title="No matching proposals">Clear the search or create the first submission.</EmptyBlock> : null}
    </section>

    <aside className="detail-panel" aria-label="Proposal detail">
      {detail.loading ? <LoadingBlock label="Opening the canonical record…" /> : detail.error ? <ErrorBlock message={detail.error} /> : detail.data ? <>
        <header className="detail-heading"><div><p className="eyebrow">One canonical record</p><h2>{detail.data.proposal.title}</h2></div><StatusChip value={detail.data.proposal.status} /></header>
        {message ? <Notice>{message}</Notice> : null}
        {role === "speaker" && editing ? <ProposalEditForm detail={detail.data} onSaved={async (savedMessage) => { setMessage(savedMessage); setEditing(false); await Promise.all([list.reload(), detail.reload()]); }} /> : <>
          <section className="record-section submitted-record">
            <div className="section-label"><span>01</span><div><strong>Submitted information</strong><small>Authored by the speaker · never AI-modified</small></div></div>
            <dl className="record-facts"><div><dt>Speaker</dt><dd>{detail.data.proposal.submitter_name}</dd></div><div><dt>Track</dt><dd>{detail.data.proposal.track_name}</dd></div><div><dt>Format</dt><dd>{detail.data.proposal.format_name}</dd></div><div><dt>Audience</dt><dd>{detail.data.proposal.audience_level}</dd></div></dl>
            <h3>Abstract</h3><p>{detail.data.proposal.abstract}</p>
            {detail.data.proposal.key_takeaway ? <><h3>Key takeaway</h3><p>{detail.data.proposal.key_takeaway}</p></> : null}
            {detail.data.answers?.length ? <><h3>Custom form answers</h3><dl className="record-facts">{detail.data.answers.map((answer) => <div key={answer.field_id}><dt>{answer.label}</dt><dd>{String(JSON.parse(String(answer.value_json)))}</dd></div>)}</dl></> : null}
            <div className="people-line">{detail.data.participants.map((person) => <span key={person.id}>{person.name} · {person.role_label}</span>)}</div>
          </section>
          {role === "organizer" ? <>
            <section className="record-section ai-record"><div className="section-label"><span>02</span><div><strong>AI-powered research</strong><small>Sourced context · visible to organizers and reviewers</small></div></div>
              <p>{detail.data.research?.summary ?? "Research has not been generated for this proposal."}</p>
              {detail.data.research?.sources_json ? <ul className="source-list">{JSON.parse(String(detail.data.research.sources_json)).map((source: Row) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} <ExternalLink size={12} /></a></li>)}</ul> : null}
            </section>
            <section className="record-section"><div className="section-label"><span>03</span><div><strong>Human review evidence</strong><small>Committee scores and comments</small></div></div>
              {detail.data.assignments.length ? detail.data.assignments.map((assignment) => <article className="review-evidence" key={assignment.id}>
                <div><UserRoundCheck size={16} /><strong>{assignment.reviewer_name}</strong><StatusChip value={assignment.status} /></div>
                <p>{assignment.aggregate_score ? `Weighted score ${Number(assignment.aggregate_score).toFixed(1)} / 5` : "Review not submitted yet."}</p>
                {(detail.data?.reviewValues ?? []).filter((value) => value.assignment_id === assignment.id).map((value) => <p key={value.criterion_id}><strong>{value.label}:</strong> {String(JSON.parse(String(value.value_json)))}</p>)}
              </article>) : <p className="muted-copy">No human reviews recorded yet.</p>}
            </section>
            <section className="record-section advice-record"><div className="section-label"><span>04</span><div><strong>Program Advisor recommendation</strong><small>Advisory only · human decision required</small></div></div>
              {detail.data.ai ? <><div className="recommendation-line"><Sparkles size={16} /><strong>{detail.data.ai.override_disposition ?? detail.data.ai.disposition}</strong><span>{detail.data.ai.override_disposition ? "Human override" : `${Math.round(Number(detail.data.ai.confidence) * 100)}% confidence`}</span></div><p>{detail.data.ai.reasoning}</p><p className="warning-copy">Concern: {detail.data.ai.concerns}</p>{detail.data.ai.override_reason ? <p><strong>Override reason:</strong> {detail.data.ai.override_reason}</p> : <button className="button button-quiet button-small" onClick={overrideAi}>Record human override</button>}</> : <p>No AI recommendation yet.</p>}
            </section>
          </> : null}
        </>}
        <footer className="detail-actions">
          {role === "organizer" ? <><button className="button button-quiet" onClick={share}><Share2 size={15} /> Share read-only</button><div><button className="button button-quiet" onClick={() => decide("rejected")}>Reject + notify</button><button className="button button-accent" onClick={() => decide("accepted")}>Accept + hand off</button></div></> :
            <button className="button button-quiet" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel editing" : "Edit submission"}</button>}
        </footer>
      </> : <EmptyBlock title="Select a proposal">Choose a row to inspect the complete record.</EmptyBlock>}
    </aside>
  </div>;
}

function ProposalEditForm({ detail, onSaved }: { detail: ProposalDetail; onSaved: (message: string) => void }) {
  const proposal = detail.proposal;
  const [title, setTitle] = useState(String(proposal.title));
  const [abstract, setAbstract] = useState(String(proposal.abstract));
  const [keyTakeaway, setKeyTakeaway] = useState(String(proposal.key_takeaway ?? ""));
  const [coSpeakers, setCoSpeakers] = useState<CoSpeakerEntry[]>(() => detail.participants
    .filter((person) => !person.is_primary)
    .map((person) => ({ name: String(person.name ?? ""), email: String(person.email ?? "") })));
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true);
    try {
      const result = await apiRequest<{ message: string }>(`/api/proposals/${proposal.id}`, {
        method: "PATCH", body: JSON.stringify({ title, abstract, keyTakeaway, coSpeakers: completedCoSpeakers(coSpeakers) }),
      });
      onSaved(result.message);
    } finally { setPending(false); }
  }
  return <form className="stack-form record-section" onSubmit={submit}><h3>Edit submission</h3>
    <label>Session title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Abstract<textarea required rows={9} value={abstract} onChange={(event) => setAbstract(event.target.value)} /></label>
    <label>Key takeaway<input required value={keyTakeaway} onChange={(event) => setKeyTakeaway(event.target.value)} /></label>
    <CoSpeakerFields value={coSpeakers} onChange={setCoSpeakers} />
    <button className="button button-accent" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></form>;
}
