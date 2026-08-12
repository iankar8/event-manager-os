import { ArrowRight, Check, CircleAlert, ClipboardCheck, FileText } from "lucide-react";

import type { WorkspaceContext } from "../types";

const lifecycle = ["Submitted", "Reviewed", "Accepted", "Onboarding", "Approved", "Scheduled", "Published"];

function countByStatus(items: { status: string; count: number }[], status?: string) {
  return items.filter((item) => !status || item.status === status).reduce((sum, item) => sum + item.count, 0);
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
  const recordTitle = role === "speaker" ? "Your AI Pair Programmer Is Lying to You" : "Taming 40-Minute CI";

  return <>
    <section className="metric-grid" aria-label={`${role} workspace summary`}>
      {metrics.map(([label, value, note]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}
    </section>
    <section className="workspace-grid">
      <article className="record-panel">
        <header><div><p className="eyebrow">One record trace</p><h2>{recordTitle}</h2></div><span className="status-chip">{role === "speaker" ? "Onboarding" : "In review"}</span></header>
        <div className="record-flow">
          {lifecycle.map((step, index) => {
            const completeThrough = role === "speaker" ? 3 : 1;
            return <div key={step} className={index <= completeThrough ? "complete" : index === completeThrough + 1 ? "current" : ""}>
              <span>{index <= completeThrough ? <Check size={12} /> : index + 1}</span>
              <strong>{step}</strong><small>{index <= completeThrough ? "Recorded" : index === completeThrough + 1 ? "Next handoff" : "Waiting"}</small>
            </div>;
          })}
        </div>
        <footer><span>Submitted facts, sourced research, AI advice, and human decisions remain separate.</span>
          <button type="button" onClick={() => open(role === "reviewer" ? "reviews" : role === "speaker" ? "submissions" : "proposals")}>Open record <ArrowRight size={14} /></button></footer>
      </article>
      <article className="attention-panel">
        <header><p className="eyebrow">Needs attention</p><h2>{role === "organizer" ? "Three decisions before publishing" : role === "reviewer" ? "One review remains" : "One task remains"}</h2></header>
        <ul>
          {role === "organizer" ? <>
            <li><CircleAlert size={16} /><span><strong>1 proposal unassigned</strong><small>Capacity is available; auto-assign is ready.</small></span></li>
            <li><CircleAlert size={16} /><span><strong>Slides due May 1</strong><small>One file request remains incomplete.</small></span></li>
            <li><CircleAlert size={16} /><span><strong>Draft schedule unpublished</strong><small>The current public revision stays untouched.</small></span></li>
          </> : role === "reviewer" ?
            <li><ClipboardCheck size={16} /><span><strong>Taming 40-Minute CI</strong><small>Strong expertise match · due October 15.</small></span></li> :
            <li><FileText size={16} /><span><strong>Upload final slides</strong><small>PDF, PPT, or PPTX · due May 1, 2027.</small></span></li>}
        </ul>
      </article>
    </section>
  </>;
}
