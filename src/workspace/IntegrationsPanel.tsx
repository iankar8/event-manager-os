import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CloudOff, PlugZap, RefreshCcw, ShieldCheck, TriangleAlert } from "lucide-react";

import { apiRequest } from "../lib/api";
import { useResource } from "../lib/useResource";
import { ErrorBlock, formatDateTime, LoadingBlock, Notice, Row, StatusChip } from "./shared";

type Summary = { creates: number; updates: number; skips: number; warnings: number; applied: number; failed: number };
type PreviewItem = { recordType: string; sourceId: string; action: string; diff: string[]; unsupportedFields: string[] };
type IntegrationData = {
  connection: Row | null;
  runs: Row[];
  deliveryMode: "outbox" | "live";
  credentialsConfigured: boolean;
};
type PreviewResult = { runId: string; summary: Summary; items: PreviewItem[]; message: string };

const emptySummary: Summary = { creates: 0, updates: 0, skips: 0, warnings: 0, applied: 0, failed: 0 };

function parseSummary(value: unknown): Summary {
  try { return { ...emptySummary, ...JSON.parse(String(value ?? "{}")) }; }
  catch { return emptySummary; }
}

function shortId(value: unknown) {
  const raw = String(value ?? "unknown");
  return raw.length > 12 ? `${raw.slice(0, 9)}…` : raw;
}

export function IntegrationsPanel() {
  const resource = useResource<IntegrationData>("/api/integrations/accelevents");
  const [eventUrl, setEventUrl] = useState("devflow-conf-2027");
  const [eventId, setEventId] = useState("");
  const [format, setFormat] = useState("IN_PERSON");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const connection = resource.data?.connection;
    if (!connection) return;
    setEventUrl(connection.external_event_url);
    setEventId(connection.external_event_id ?? "");
    setFormat(connection.session_type_format);
  }, [resource.data?.connection]);

  const latestRun = resource.data?.runs[0];
  const visibleSummary = useMemo(() => preview?.summary ?? parseSummary(latestRun?.summary_json), [latestRun?.summary_json, preview]);
  const applicableRunId = preview?.runId ?? (latestRun?.status === "previewed" ? latestRun.id : null);

  async function saveConnection(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result = await apiRequest<{ message: string }>("/api/integrations/accelevents/connection", {
        method: "PUT", body: JSON.stringify({ eventUrl, eventId: eventId || undefined, sessionTypeFormat: format }),
      });
      setMessage(result.message); await resource.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The destination could not be saved."); }
    finally { setBusy(false); }
  }

  async function createPreview() {
    setBusy(true); setMessage(null);
    try {
      const result = await apiRequest<PreviewResult>("/api/integrations/accelevents/preview", { method: "POST", body: "{}" });
      setPreview(result); setMessage(result.message); await resource.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The preview could not be created."); }
    finally { setBusy(false); }
  }

  async function applyPreview() {
    if (!applicableRunId) return;
    setBusy(true); setMessage(null);
    try {
      const result = await apiRequest<{ message: string }>(`/api/integrations/accelevents/runs/${applicableRunId}/apply`, {
        method: "POST", body: JSON.stringify({ confirm: true }),
      });
      setPreview(null); setMessage(result.message); await resource.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The approved preview could not be applied."); }
    finally { setBusy(false); }
  }

  if (resource.loading) return <LoadingBlock label="Loading destination receipts…" />;
  if (resource.error) return <ErrorBlock message={resource.error} />;
  if (!resource.data) return null;

  const simulation = resource.data.deliveryMode === "outbox";
  return <div className="integration-workspace">
    {message ? <Notice tone={/could not|required|error/i.test(message) ? "warning" : "success"}>{message}</Notice> : null}
    <section className="panel-card integration-hero">
      <div className="integration-mark"><PlugZap size={22} /></div><div><p className="eyebrow">One-way destination</p><h2>Accelevents handoff</h2><p>Preview approved speaker and session records from the published schedule, then apply one explicit, receipt-backed handoff.</p></div>
      <div className="integration-mode"><StatusChip value={simulation ? "outbox simulation" : "live delivery"} /><small>{simulation ? "No external request" : resource.data.credentialsConfigured ? "Credentials configured" : "Credentials missing"}</small></div>
    </section>

    <section className="integration-grid">
      <form className="panel-card integration-target" onSubmit={saveConnection}>
        <header><div><p className="eyebrow">Destination target</p><h3>Connection</h3></div><StatusChip value={resource.data.connection?.status ?? "not connected"} /></header>
        <label>Accelevents event URL slug<input value={eventUrl} onChange={(event) => setEventUrl(event.target.value)} required pattern="[A-Za-z0-9][A-Za-z0-9-]*" /></label>
        <label>External event ID <small>Optional until live delivery</small><input value={eventId} onChange={(event) => setEventId(event.target.value)} placeholder="1001" /></label>
        <label>Session type<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="IN_PERSON">In person</option><option value="VIRTUAL">Virtual</option><option value="HYBRID">Hybrid</option></select></label>
        <button className="button button-quiet" disabled={busy} type="submit"><ShieldCheck size={15} /> Save target</button>
        <p className="target-note"><CloudOff size={14} /> Saving a target never sends data.</p>
      </form>

      <section className="panel-card integration-preview">
        <header className="section-toolbar"><div><p className="eyebrow">Latest plan</p><h2>{latestRun ? `Published source ${shortId(latestRun.source_revision_id)}` : "No preview yet"}</h2><p>Every count is computed before delivery and remains attached to its source revision.</p></div>{latestRun ? <StatusChip value={latestRun.status} /> : null}</header>
        <div className="integration-metrics">
          {[ ["Creates", visibleSummary.creates], ["Updates", visibleSummary.updates], ["No-ops", visibleSummary.skips], ["Warnings", visibleSummary.warnings] ].map(([label, value]) => <article key={String(label)}><strong>{value}</strong><small>{label}</small></article>)}
        </div>
        <div className={`integration-proof ${simulation ? "simulation" : "live"}`}>
          {simulation ? <CloudOff size={17} /> : <CheckCircle2 size={17} />}<span><strong>{simulation ? "SIM · local destination mirror" : "LIVE · external delivery"}</strong><small>{simulation ? "Apply records deterministic receipts without contacting Accelevents." : "Apply will use the configured Worker secret."}</small></span>
        </div>
        {preview?.items.length ? <div className="integration-items">{preview.items.map((item) => <article key={`${item.recordType}-${item.sourceId}`}><span className="integration-kind">{item.recordType}</span><span><strong>{item.sourceId}</strong><small>{item.diff.length ? `${item.diff.length} mapped field changes` : "Payload unchanged"}</small></span><StatusChip value={item.action === "skip" ? "no-op" : item.action} />{item.unsupportedFields.length ? <p><TriangleAlert size={13} /> Confirm {item.unsupportedFields.join(", ")} in the destination.</p> : null}</article>)}</div> : null}
        <footer className="integration-actions"><small>Removed records become reconciliation warnings. Program Desk never silently deletes the destination copy.</small><div><button className="button button-quiet" type="button" disabled={busy || !resource.data.connection} onClick={createPreview}><RefreshCcw size={15} /> Create mutation-free preview</button><button className="button button-accent" type="button" disabled={busy || !applicableRunId} onClick={applyPreview}>Apply approved preview <ArrowRight size={15} /></button></div></footer>
      </section>
    </section>

    <section className="panel-card integration-history"><header><div><p className="eyebrow">Run history</p><h2>Receipts by source revision</h2><p>Actor, mode, result, and timestamp survive every preview and apply.</p></div><span>{resource.data.runs.length} recorded</span></header>
      {resource.data.runs.length ? <div>{resource.data.runs.map((run) => { const summary = parseSummary(run.summary_json); return <article key={run.id}><span><strong>{shortId(run.source_revision_id)}</strong><small>{formatDateTime(run.created_at)} · {run.approved_by_name ?? "System preview"}</small></span><span className="run-counts">{summary.creates} create · {summary.updates} update · {summary.skips} no-op</span><StatusChip value={run.status} /><code>{shortId(run.id)}</code></article>; })}</div> : <p className="integration-empty">Save a target and create a mutation-free preview to establish the first receipt.</p>}
    </section>
  </div>;
}
