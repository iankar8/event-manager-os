import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, CheckCircle2, Copy, Scale, Send, ShieldCheck, Sparkles, UserRoundCog } from "lucide-react";

import { apiRequest } from "../lib/api";
import { useResource } from "../lib/useResource";
import { EmptyBlock, ErrorBlock, formatDate, LoadingBlock, Notice, Row, StatusChip } from "./shared";

type ReviewValue = { assignment_id: string; criterion_id: string; value_json: string };
type ReviewData = { plans: Row[]; rounds: Row[]; criteria: Row[]; reviewers: Row[]; poolMembers: Row[]; assignments: Row[]; results: Row[]; reviewValues?: ReviewValue[] };

/** Values already stored for this assignment, so a submitted scorecard reads back as written. */
function savedValues(reviewValues: ReviewValue[] | undefined, assignmentId: unknown) {
  const saved: Record<string, string | number> = {};
  for (const entry of reviewValues ?? []) {
    if (entry.assignment_id !== assignmentId) continue;
    try {
      const parsed = JSON.parse(entry.value_json);
      if (typeof parsed === "string" || typeof parsed === "number") saved[entry.criterion_id] = parsed;
    } catch { /* a value that will not parse is left to the criterion default */ }
  }
  return saved;
}

export function ReviewPanel({ role }: { role: "organizer" | "reviewer" }) {
  const resource = useResource<ReviewData>("/api/reviews");
  const [roundId, setRoundId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);
  const [showAddCriterion, setShowAddCriterion] = useState(false);
  const [showAddRound, setShowAddRound] = useState(false);

  useEffect(() => {
    if (!roundId && resource.data?.rounds[0]) setRoundId(String(resource.data.rounds[0].id));
    // Open on outstanding work rather than whichever assignment sorts first, so a
    // reviewer with a completed review still lands on the one that needs them.
    if (!selectedAssignment && role === "reviewer" && resource.data?.assignments.length) {
      const next = resource.data.assignments.find((item) => item.status !== "submitted") ?? resource.data.assignments[0];
      setSelectedAssignment(String(next.id));
    }
  }, [resource.data, role, roundId, selectedAssignment]);

  const activeRound = resource.data?.rounds.find((round) => round.id === roundId);
  const roundCriteria = resource.data?.criteria.filter((criterion) => criterion.round_id === roundId) ?? [];
  const roundAssignments = resource.data?.assignments.filter((assignment) => assignment.round_id === roundId) ?? [];

  async function run(path: string, body?: object) {
    const result = await apiRequest<{ message: string; url?: string }>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
    setMessage(result.url ? `${result.message ?? "Join link ready"} ${result.url}` : result.message);
    await resource.reload();
  }

  if (resource.loading) return <LoadingBlock label="Loading the evaluation plan…" />;
  if (resource.error) return <ErrorBlock message={resource.error} />;
  if (!resource.data) return null;

  if (role === "reviewer") return <ReviewerQueue data={resource.data} selectedId={selectedAssignment}
    setSelectedId={setSelectedAssignment} onMessage={setMessage} reload={resource.reload} message={message} />;

  return <div className="review-workspace">
    {message ? <Notice>{message}</Notice> : null}
    <section className="plan-header panel-card">
      <div><p className="eyebrow">Evaluation plan</p><h2>{resource.data.plans[0]?.name ?? "Program review"}</h2>
        <p>Independent rounds, isolated reviewer pools, weighted scorecards, and visible progress.</p></div>
      <div className="toolbar-actions"><button className="button button-quiet" onClick={() => roundId && run("/api/reviews/join-link", { roundId })}><Copy size={15} /> Copy reviewer join link</button>
        <button className="button button-accent" onClick={() => roundId && run("/api/reviews/auto-assign", { roundId })}><Sparkles size={15} /> Auto-assign ready reviewers</button></div>
    </section>
    <div className="round-tabs" role="tablist" aria-label="Review rounds">
      {resource.data.rounds.map((round, index) => <button key={round.id} role="tab" aria-selected={roundId === round.id} onClick={() => setRoundId(String(round.id))}>
        <span>Round {index + 1}</span><strong>{round.name}</strong><small>{round.required_reviews} review{Number(round.required_reviews) === 1 ? "" : "s"} · {round.blind_review ? "Blind" : "Named"}</small></button>)}
      <button className="add-round" onClick={() => setShowAddRound((value) => !value)}>+ Add round</button>
    </div>
    {showAddRound ? <RoundForm planId={String(resource.data.plans[0]?.id)} onAdded={async (text) => { setMessage(text); setShowAddRound(false); await resource.reload(); }} /> : null}
    {activeRound ? <section className="round-detail panel-card">
      <header className="section-toolbar"><div><p className="eyebrow">Round configuration</p><h2>{activeRound.name}</h2></div><StatusChip value={activeRound.status} /></header>
      <dl className="inline-facts"><div><dt>Opens</dt><dd>{formatDate(activeRound.opens_at)}</dd></div><div><dt>Closes</dt><dd>{formatDate(activeRound.closes_at)}</dd></div>
        <div><dt>Required reviews</dt><dd>{activeRound.required_reviews}</dd></div><div><dt>Identity</dt><dd>{activeRound.blind_review ? "Anonymized" : "Named"}</dd></div></dl>
      <div className="scorecard-builder"><header><div><h3>Scorecard</h3><p>Each round owns its criteria. Weights affect the aggregate.</p></div><button className="button button-quiet button-small" onClick={() => setShowAddCriterion((value) => !value)}>+ Add criterion</button></header>
        {roundCriteria.map((criterion) => <article key={criterion.id}><span className="criterion-type">{criterion.criterion_type.replace("_", " ")}</span><strong>{criterion.label}</strong><small>{criterion.required ? "Required" : "Optional"} · Weight {criterion.weight}{criterion.min_value ? ` · ${criterion.min_value}–${criterion.max_value}` : ""}</small></article>)}
        {showAddCriterion ? <CriterionForm roundId={String(activeRound.id)} onAdded={async (text) => { setMessage(text); setShowAddCriterion(false); await resource.reload(); }} /> : null}
      </div>
      <PoolManager roundId={String(activeRound.id)} reviewers={resource.data.reviewers} members={resource.data.poolMembers.filter((member) => member.round_id === activeRound.id)} onAdded={async (text) => { setMessage(text); await resource.reload(); }} />
    </section> : null}
    <section className="review-grid">
      <article className="panel-card">
        <header className="section-toolbar"><div><p className="eyebrow">Reviewer capacity</p><h2>Progress by reviewer</h2></div><button className="button button-quiet button-small" onClick={() => run("/api/reviews/remind")}><Send size={14} /> Remind outstanding</button></header>
        <div className="progress-list">{resource.data.reviewers.map((reviewer) => { const assigned = Number(reviewer.assigned ?? 0); const completed = Number(reviewer.completed ?? 0); const percent = assigned ? Math.round(completed / assigned * 100) : 0; return <article key={reviewer.id}>
          <div><span className="avatar avatar-small">{String(reviewer.name).split(" ").map((part) => part[0]).join("")}</span><span><strong>{reviewer.name}</strong><small>{reviewer.topics}</small></span><StatusChip value={reviewer.status} /></div>
          <div className="progress-track"><span style={{ width: `${percent}%` }} /></div><small>{completed}/{assigned} complete · capacity {reviewer.max_capacity}</small></article>; })}</div>
      </article>
      <article className="panel-card">
        <header className="section-toolbar"><div><p className="eyebrow">Assignment ledger</p><h2>{roundAssignments.length} mapped reviews</h2></div><Scale size={18} /></header>
        {roundId ? <ManualAssignmentForm roundId={roundId} proposals={resource.data.results} reviewers={resource.data.reviewers} members={resource.data.poolMembers.filter((member) => member.round_id === roundId)} onAssigned={async (text) => { setMessage(text); await resource.reload(); }} /> : null}
        <div className="assignment-list">{roundAssignments.map((assignment) => <article key={assignment.id}><div><strong>{assignment.title}</strong><small>{assignment.reviewer_name} · {assignment.track_name}</small></div><StatusChip value={assignment.status} /><p>{assignment.assignment_reason}</p></article>)}</div>
      </article>
    </section>
    <section className="panel-card results-panel"><header className="section-toolbar"><div><p className="eyebrow">Round results</p><h2>Human evidence and AI advice</h2></div><a className="button button-quiet button-small" href="/api/proposals/export.csv">Export scores</a></header>
      <div className="results-table"><div className="table-row table-head"><span>Proposal</span><span>Human aggregate</span><span>Progress</span><span>AI advisory</span></div>
        {[...resource.data.results].sort((a, b) => Number(b.aggregate_score ?? -1) - Number(a.aggregate_score ?? -1)).map((result) => <div className="table-row" key={result.id}><span><strong>{result.title}</strong><small>{result.track_name}</small></span>
          <span><strong>{result.aggregate_score ?? "—"}</strong><small>Weighted committee score</small></span><span>{result.completed}/{result.assigned}<small>reviews complete</small></span>
          <span><StatusChip value={result.override_disposition ?? result.ai_disposition ?? "not scored"} /><small>{result.override_disposition ? "Human override" : result.ai_confidence ? `${Math.round(Number(result.ai_confidence) * 100)}% confidence` : "Separate from humans"}</small></span></div>)}</div>
    </section>
  </div>;
}

function RoundForm({ planId, onAdded }: { planId: string; onAdded: (message: string) => void }) {
  const [name, setName] = useState("Committee Calibration"); const [opensAt, setOpensAt] = useState("2026-10-16");
  const [closesAt, setClosesAt] = useState("2026-11-30"); const [requiredReviews, setRequiredReviews] = useState(2); const [blindReview, setBlindReview] = useState(true);
  async function submit(event: FormEvent) {
    event.preventDefault(); const result = await apiRequest<{ message: string }>("/api/reviews/rounds", { method: "POST", body: JSON.stringify({
      planId, name, opensAt, closesAt, requiredReviews, blindReview, instructions: "Review independently against this round's scorecard.",
    }) }); onAdded(result.message);
  }
  return <form className="inline-form panel-card round-create-form" onSubmit={submit}><label>Round name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Opens<input type="date" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} /></label><label>Closes<input type="date" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} /></label><label>Reviews per proposal<input type="number" min="1" max="5" value={requiredReviews} onChange={(event) => setRequiredReviews(Number(event.target.value))} /></label><label className="check-label"><input type="checkbox" checked={blindReview} onChange={(event) => setBlindReview(event.target.checked)} /> Anonymize authors</label><button className="button button-accent">Create independent round</button></form>;
}

function PoolManager({ roundId, reviewers, members, onAdded }: { roundId: string; reviewers: Row[]; members: Row[]; onAdded: (message: string) => void }) {
  const available = reviewers.filter((reviewer) => !members.some((member) => member.reviewer_id === reviewer.id));
  const [reviewerId, setReviewerId] = useState("");
  useEffect(() => { if (!available.some((reviewer) => reviewer.id === reviewerId)) setReviewerId(String(available[0]?.id ?? "")); }, [available, reviewerId]);
  async function add() {
    if (!reviewerId) return;
    const result = await apiRequest<{ message: string }>(`/api/reviews/rounds/${roundId}/reviewers`, { method: "POST", body: JSON.stringify({ reviewerId }) });
    onAdded(result.message);
  }
  return <section className="pool-manager"><header><div><h3>Reviewer pool</h3><p>Membership applies only to this round.</p></div><StatusChip value={`${members.length} reviewers`} /></header>
    <div className="pool-members">{members.map((member) => <span key={member.reviewer_id}><UserRoundCog size={14} /> {member.reviewer_name}</span>)}</div>
    {available.length ? <div className="inline-form"><label>Add reviewer<select aria-label="Reviewer for this round" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}>{available.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.name}</option>)}</select></label><button className="button button-quiet button-small" type="button" onClick={add}>Add only to this round</button></div> : <p className="muted-copy">Every ready reviewer is already in this round.</p>}
  </section>;
}

function ManualAssignmentForm({ roundId, proposals, reviewers, members, onAssigned }: { roundId: string; proposals: Row[]; reviewers: Row[]; members: Row[]; onAssigned: (message: string) => void }) {
  const pool = reviewers.filter((reviewer) => members.some((member) => member.reviewer_id === reviewer.id));
  const [proposalId, setProposalId] = useState(""); const [reviewerId, setReviewerId] = useState("");
  useEffect(() => { setProposalId(String(proposals[0]?.id ?? "")); setReviewerId(String(pool[0]?.id ?? "")); }, [roundId, proposals, pool]);
  async function assign(event: FormEvent) {
    event.preventDefault(); if (!proposalId || !reviewerId) return;
    const result = await apiRequest<{ message: string }>("/api/reviews/assign", { method: "POST", body: JSON.stringify({ roundId, proposalId, reviewerId }) });
    onAssigned(result.message);
  }
  return <form className="manual-assignment-form" onSubmit={assign}><label>Proposal<select value={proposalId} onChange={(event) => setProposalId(event.target.value)}>{proposals.map((proposal) => <option key={proposal.id} value={proposal.id}>{proposal.title}</option>)}</select></label><label>Round reviewer<select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}><option value="">Choose from this round…</option>{pool.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.name}</option>)}</select></label><button className="button button-quiet button-small" disabled={!proposalId || !reviewerId}>Assign selected</button></form>;
}

function ReviewerQueue({ data, selectedId, setSelectedId, onMessage, reload, message }: {
  data: ReviewData; selectedId: string | null; setSelectedId: (id: string) => void;
  onMessage: (message: string) => void; reload: () => Promise<void>; message: string | null;
}) {
  const assignment = data.assignments.find((item) => item.id === selectedId);
  const criteria = data.criteria.filter((criterion) => criterion.round_id === assignment?.round_id);
  return <div className="reviewer-layout">
    {message ? <Notice>{message}</Notice> : null}
    <section className="panel-card queue-panel"><header><p className="eyebrow">My review queue</p><h2>{data.assignments.filter((item) => item.status !== "submitted").length} remaining</h2><p>Only proposals assigned to you are visible. Organizer navigation and other submissions are blocked.</p></header>
      <div className="queue-list">{data.assignments.map((item) => <button key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(String(item.id))}>
        <span><strong>{item.title}</strong><small>{item.track_name} · due {formatDate(item.closes_at)}</small></span><StatusChip value={item.status} /></button>)}</div>
    </section>
    <section className="panel-card review-form-panel">{assignment ? <>
      <header className="detail-heading"><div><p className="eyebrow">{assignment.round_name} · scorecard</p><h2>{assignment.title}</h2></div><StatusChip value={assignment.status} /></header>
      <div className="scope-proof"><ShieldCheck size={16} /><span>{assignment.blind_review ? "Blind review is on: author and co-author identity is hidden." : `Author: ${assignment.submitter_name}`}</span></div>
      <section className="record-section"><h3>Submitted abstract</h3><p>{assignment.abstract}</p><dl className="record-facts"><div><dt>Track</dt><dd>{assignment.track_name}</dd></div><div><dt>Format</dt><dd>{assignment.format_name}</dd></div><div><dt>Audience</dt><dd>{assignment.audience_level}</dd></div></dl></section>
      <section className="record-section ai-record"><div className="section-label"><span>AI</span><div><strong>Organizer-provided research</strong><small>Sourced context · separate from the submitted abstract</small></div></div><p>{assignment.research_summary || "No research brief has been attached."}</p>
        {assignment.research_sources_json ? <ul className="source-list">{JSON.parse(String(assignment.research_sources_json)).map((source: Row) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul> : null}</section>
      <ReviewForm assignment={assignment} criteria={criteria} saved={savedValues(data.reviewValues, assignment.id)}
        onSubmitted={async (text) => { onMessage(text); await reload(); }} />
    </> : <EmptyBlock title="Choose an assignment">Select an assigned proposal to begin.</EmptyBlock>}</section>
  </div>;
}

function ReviewForm({ assignment, criteria, saved, onSubmitted }: { assignment: Row; criteria: Row[]; saved: Record<string, string | number>; onSubmitted: (message: string) => void }) {
  const initial = () => Object.fromEntries(criteria.map((criterion) => [criterion.id,
    saved[String(criterion.id)] ?? (criterion.criterion_type === "numeric" ? 4 : "")]));
  const [values, setValues] = useState<Record<string, string | number>>(initial);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const savedKey = JSON.stringify(saved);
  useEffect(() => setValues(initial()), [assignment.id, criteria, savedKey]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true);
    try {
      const result = await apiRequest<{ message: string }>(`/api/reviews/assignments/${assignment.id}/submit`, {
        method: "POST", body: JSON.stringify({ values: criteria.map((criterion) => ({ criterionId: criterion.id, value: values[criterion.id] })) }),
      }); onSubmitted(result.message);
    } finally { setPending(false); }
  }
  async function recuse() {
    const result = await apiRequest<{ message: string }>(`/api/reviews/assignments/${assignment.id}/recuse`, {
      method: "POST", body: JSON.stringify({ reason: "I have a professional conflict with a listed participant." }),
    }); onSubmitted(result.message); setConflict(true);
  }
  return <form className="scorecard-form" onSubmit={submit}><div className="section-label"><span>02</span><div><strong>Human scorecard</strong><small>Your independent evaluation</small></div></div>
    {criteria.map((criterion) => <label key={criterion.id}>{criterion.label} <small>Weight {criterion.weight}{criterion.required ? " · required" : ""}</small>
      {criterion.criterion_type === "numeric" ? <input type="number" min={criterion.min_value ?? 1} max={criterion.max_value ?? 5} required={Boolean(criterion.required)} value={values[criterion.id] ?? 4} onChange={(event) => setValues({ ...values, [criterion.id]: Number(event.target.value) })} /> :
        criterion.criterion_type === "dropdown" ? <select required={Boolean(criterion.required)} value={values[criterion.id] ?? ""} onChange={(event) => setValues({ ...values, [criterion.id]: event.target.value })}><option value="">Choose…</option>{JSON.parse(String(criterion.options_json ?? "[]")).map((option: string) => <option key={option}>{option}</option>)}</select> :
          <textarea rows={4} required={Boolean(criterion.required)} value={values[criterion.id] ?? ""} onChange={(event) => setValues({ ...values, [criterion.id]: event.target.value })} />}</label>)}
    <div className="form-actions"><button type="button" className="button button-quiet" onClick={recuse} disabled={conflict}>Declare conflict / recuse</button><button className="button button-accent" disabled={pending || conflict}>{pending ? "Submitting…" : "Submit review"} <ArrowRight size={15} /></button></div></form>;
}

function CriterionForm({ roundId, onAdded }: { roundId: string; onAdded: (message: string) => void }) {
  const [label, setLabel] = useState("Audience value");
  const [type, setType] = useState("numeric");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await apiRequest<{ message: string }>(`/api/reviews/rounds/${roundId}/criteria`, { method: "POST",
      body: JSON.stringify({ label, criterionType: type, required: true, weight: 1, minValue: 1, maxValue: 5,
        options: type === "dropdown" ? ["Accept", "Maybe", "Reject"] : [] }) });
    onAdded(result.message);
  }
  return <form className="inline-form criterion-form" onSubmit={submit}><label>Criterion label<input value={label} onChange={(event) => setLabel(event.target.value)} /></label>
    <label>Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="numeric">Numeric rating</option><option value="dropdown">Dropdown</option><option value="long_text">Free text</option></select></label>
    <button className="button button-accent button-small">Add to this round</button></form>;
}
