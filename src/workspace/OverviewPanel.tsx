import { useEffect, useState } from "react";
import { ArrowRight, Check, CircleAlert, ClipboardCheck, FileText } from "lucide-react";

import { useResource } from "../lib/useResource";
import type { TraceResponse, TraceStage, WorkspaceContext } from "../types";
import { formatDate } from "./shared";

function countByStatus(items: { status: string; count: number }[], status?: string) {
  return items.filter((item) => !status || item.status === status).reduce((sum, item) => sum + item.count, 0);
}

function stamp(value: string | null) {
  return value ? formatDate(value, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : null;
}

/** The rail is seven columns wide, so it carries the date only; the evidence panel shows the full timestamp. */
function railStamp(value: string | null) {
  return value ? formatDate(value, { month: "short", day: "numeric" }) : null;
}

/** Receipts are shown truncated for width, but the value is always a real row id. */
function shortReceipt(id: string) {
  return id.length > 16 ? `${id.slice(0, 16)}…` : id;
}

export function OverviewPanel({ data, role, open }: {
  data: WorkspaceContext;
  role: "organizer" | "reviewer" | "speaker";
  open: (section: string) => void;
}) {
  const totalProposals = countByStatus(data.summary.proposals);
  const activeReviews = countByStatus(data.summary.reviews, "assigned") + countByStatus(data.summary.reviews, "in_progress");
  const completedTasks = countByStatus(data.summary.tasks, "complete");
  const totalTasks = countByStatus(data.summary.tasks);
  const metrics = role === "organizer" ? [
    ["Proposals", String(totalProposals), "Across the active event only"],
    ["Open reviews", String(activeReviews), "Scoped to active rounds"],
    ["Speaker readiness", `${completedTasks}/${totalTasks}`, "Required tasks complete"],
    ["Published sessions", String(data.summary.sessions), "Approved canonical records"],
  ] : role === "reviewer" ? [
    ["Assigned to me", String(totalProposals), "No unassigned proposals exposed"],
    ["Open reviews", String(activeReviews), "My queue only"],
    ["Submitted reviews", String(countByStatus(data.summary.reviews, "submitted")), "Persisted for organizers"],
    ["Referenced sessions", String(data.summary.sessions), "From proposals I reviewed"],
  ] : [
    ["My submissions", String(totalProposals), "My proposals and co-authored talks"],
    ["Committee reviews", String(countByStatus(data.summary.reviews, "submitted")), "Status only; reviewer notes stay private"],
    ["Speaker readiness", `${completedTasks}/${totalTasks}`, "My assigned tasks"],
    ["My sessions", String(data.summary.sessions), "No other speakers exposed"],
  ];

  // The trace is organizer-scoped on the server; other personas never request it.
  const traceResource = useResource<TraceResponse>(role === "organizer" ? "/api/context/trace" : null);
  const trace = traceResource.data?.trace ?? null;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!trace || selectedKey) return;
    // Open on the first stage still missing evidence, or the last recorded one.
    const firstIncomplete = trace.stages.find((stage) => !stage.complete);
    setSelectedKey(firstIncomplete?.key ?? trace.stages[trace.stages.length - 1]?.key ?? null);
  }, [trace, selectedKey]);

  const selected = trace?.stages.find((stage) => stage.key === selectedKey) ?? null;
  const openTasks = totalTasks - completedTasks;
  const incompleteStages = trace?.stages.filter((stage) => !stage.complete) ?? [];

  return <>
    <section className="metric-grid" aria-label={`${role} workspace summary`}>
      {metrics.map(([label, value, note]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}
    </section>
    <section className="workspace-grid">
      <article className="record-panel">
        {traceResource.loading ? <header><div><p className="eyebrow">One record trace</p><h2>Loading the program record…</h2></div></header> : null}
        {!traceResource.loading && !trace ? <header><div><p className="eyebrow">One record trace</p><h2>No record has reached the public program yet</h2>
          <p className="record-empty">{traceResource.data?.reason ?? "A proposal appears here once it is accepted, scheduled, and published."}</p></div></header> : null}
        {trace ? <>
          <header>
            <div>
              <p className="eyebrow">One record trace{trace.trackName ? ` · ${trace.trackName}` : ""}</p>
              <h2>{trace.title}</h2>
              <p className="record-subject">{trace.speakerName ? `Submitted by ${trace.speakerName}` : null}</p>
            </div>
            <span className="status-chip">{trace.completeStages} of {trace.stages.length} recorded</span>
          </header>
          <div className="record-flow" role="tablist" aria-label="Program record lifecycle">
            {trace.stages.map((stage, index) => <button
              type="button"
              key={stage.key}
              role="tab"
              id={`trace-tab-${stage.key}`}
              aria-selected={selectedKey === stage.key}
              aria-controls="trace-evidence"
              className={`${stage.complete ? "complete" : "pending"} ${selectedKey === stage.key ? "selected" : ""}`}
              onClick={() => setSelectedKey(stage.key)}
            >
              <span>{stage.complete ? <Check size={12} /> : index + 1}</span>
              <strong>{stage.label}</strong>
              <small>{stage.complete ? railStamp(stage.occurredAt) ?? "Recorded" : "Not recorded"}</small>
            </button>)}
          </div>
          {selected ? <StageEvidence stage={selected} open={open} /> : null}
        </> : null}
      </article>
      <article className="attention-panel">
        <header><p className="eyebrow">Needs attention</p>
          <h2>{incompleteStages.length + (openTasks > 0 ? 1 : 0) === 0 ? "Nothing outstanding" : "Outstanding in this event"}</h2></header>
        <ul>
          {openTasks > 0 ? <li><ClipboardCheck size={16} /><span>
            <strong>{openTasks} speaker task{openTasks === 1 ? "" : "s"} open</strong>
            <small>Counted from required deliverables in this event.</small></span></li> : null}
          {incompleteStages.map((stage) => <li key={stage.key}><CircleAlert size={16} /><span>
            <strong>{stage.label} has no recorded evidence</strong>
            <small>{stage.evidence}</small></span></li>)}
          {openTasks === 0 && incompleteStages.length === 0 ? <li><FileText size={16} /><span>
            <strong>Every stage carries a receipt</strong>
            <small>Each lifecycle step on this record resolves to a persisted row.</small></span></li> : null}
        </ul>
      </article>
    </section>
  </>;
}

function StageEvidence({ stage, open }: { stage: TraceStage; open: (section: string) => void }) {
  return <section className="trace-evidence" id="trace-evidence" role="tabpanel" aria-labelledby={`trace-tab-${stage.key}`}>
    <div className="trace-evidence-head">
      <div><p className="eyebrow">{stage.label}</p><p className="trace-claim">{stage.evidence}</p></div>
      <span className={stage.complete ? "status-chip" : "status-chip status-chip-quiet"}>{stage.complete ? "Recorded" : "Not recorded"}</span>
    </div>
    <dl className="trace-facts">
      <div><dt>Who</dt><dd>{stage.actorName ? `${stage.actorName}${stage.actorRole ? ` · ${stage.actorRole}` : ""}` : "No actor recorded"}</dd></div>
      <div><dt>When</dt><dd>{stamp(stage.occurredAt) ?? "No timestamp recorded"}</dd></div>
      <div><dt>Receipt</dt><dd>{stage.receiptId
        ? <code title={stage.receiptId}>{stage.receiptType} · {shortReceipt(stage.receiptId)}</code>
        : "No row to cite"}</dd></div>
    </dl>
    <p className="trace-rule"><strong>Rule</strong> {stage.rule}</p>
    <footer>
      <span>{stage.complete ? "Open the surface holding this record." : "The destination exists; this stage has no record yet."}</span>
      <button type="button" onClick={() => open(stage.section)}>Open {stage.destination} <ArrowRight size={14} /></button>
    </footer>
  </section>;
}
