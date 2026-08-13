import { useMemo, useState } from "react";
import { Code2, ExternalLink, Globe2, Palette, RefreshCcw } from "lucide-react";

import { apiRequest } from "../lib/api";
import { useResource } from "../lib/useResource";
import { ErrorBlock, LoadingBlock, Notice, Row, StatusChip } from "./shared";

type PublishingData = { event: Row; embeds: Row[]; tracks: Row[] } & Record<string, unknown>;
const surfaces = [
  ["sessions", "Sessions list", "Searchable cards with speaker and track metadata"],
  ["speakers", "Speakers list", "Alphabetized directory with profile drill-down"],
  ["agenda", "Agenda", "Day, time, and room grid"],
  ["itinerary", "Schedule itinerary", "Chronological list and personal schedule"],
  ["speaker_gallery", "Speaker gallery", "Visual speaker grid with graceful fallbacks"],
] as const;

export function PublishPanel({ eventSlug }: { eventSlug: string }) {
  const resource = useResource<PublishingData>("/api/publishing");
  const [message, setMessage] = useState<string | null>(null);
  const [accent, setAccent] = useState("#0b7a53"); const [showBranding, setShowBranding] = useState(true);
  const [trackFilter, setTrackFilter] = useState("all"); const [visibleFields, setVisibleFields] = useState(["title", "speaker", "track", "room"]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const embedByType = useMemo(() => new Map((resource.data?.embeds ?? []).map((embed) => [embed.widget_type, embed])), [resource.data]);

  const [formats, setFormats] = useState<Record<string, string>>({});

  async function regenerate(type: string, name: string) {
    const result = await apiRequest<{ snippet: string; feedUrl: string }>("/api/publishing/embeds", { method: "POST",
      body: JSON.stringify({ widgetType: type, name: `${name} custom`, outputFormat: formats[type] ?? "iframe",
        config: { accent, showBranding, track: trackFilter, fields: visibleFields } }) });
    setMessage(`Embed saved. ${result.snippet} Feed: ${result.feedUrl}`); await resource.reload();
  }
  async function setEnabled(embedId: string, enabled: boolean) {
    const result = await apiRequest<{ message: string }>(`/api/publishing/embeds/${embedId}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
    setMessage(result.message); await resource.reload();
  }
  async function removeEmbed(embedId: string) {
    const result = await apiRequest<{ message: string }>(`/api/publishing/embeds/${embedId}`, { method: "DELETE" });
    setMessage(result.message); await resource.reload();
  }

  if (resource.loading) return <LoadingBlock label="Loading public surfaces…" />;
  if (resource.error) return <ErrorBlock message={resource.error} />;
  if (!resource.data) return null;
  return <div className="publish-workspace">
    {message ? <Notice>{message}</Notice> : null}
    <section className="panel-card public-site-card"><div><p className="eyebrow">Public program</p><h2>Five surfaces. One published record.</h2><p>Every attendee view reads the same approved sessions and the current published schedule revision.</p></div>
      <div className="site-status"><Globe2 size={20} /><span><strong>{resource.data.event.name}</strong><small>{origin}/events/{eventSlug}/agenda</small></span><StatusChip value={resource.data.event.public_status} /></div></section>
    <section className="surface-grid">{surfaces.map(([type, name, description]) => {
      const route = type === "speaker_gallery" ? "gallery" : type;
      const embed = embedByType.get(type);
      const url = `/events/${eventSlug}/${route}`;
      const format = formats[type] ?? String(embed?.output_format ?? "iframe");
      // Only formats this deployment genuinely serves are offered; a script loader
      // does not exist, so it is not on the menu, and iCal exists for the
      // itinerary feed alone.
      const formatOptions = ["iframe", "url", "json", ...(type === "itinerary" ? ["ical"] : [])];
      const token = String(embed?.public_token ?? "saved");
      const snippet = format === "iframe" ? `<iframe src="${origin}${url}?embed=${token}" title="${name}"></iframe>`
        : format === "url" ? `${origin}${url}?embed=${token}`
        : format === "ical" ? `${origin}/api/public/${eventSlug}/feed/itinerary?format=ical`
        : `${origin}/api/public/${eventSlug}/feed/${type}?token=${token}`;
      return <article className="panel-card" key={type}>
      <header><span className="surface-icon"><Code2 size={17} /></span><StatusChip value={embed ? (embed.enabled ? "ready" : "disabled") : "not configured"} /></header><h3>{name}</h3><p>{description}</p>
      <label className="format-select">Output format<select value={format} onChange={(event) => setFormats((current) => ({ ...current, [type]: event.target.value }))}>{formatOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      <div className="embed-code"><code>{snippet}</code></div><div className="surface-actions"><a className="button button-quiet button-small" href={url} target="_blank" rel="noreferrer">Open public <ExternalLink size={13} /></a>
        <button className="button button-quiet button-small" onClick={() => regenerate(type, name)}><RefreshCcw size={13} /> Regenerate</button>
        {embed ? <button className="button button-quiet button-small" onClick={() => setEnabled(String(embed.id), !embed.enabled)}>{embed.enabled ? "Disable" : "Enable"}</button> : null}
        {embed ? <button className="button button-quiet button-small" onClick={() => removeEmbed(String(embed.id))}>Delete</button> : null}</div></article>; })}</section>
    <section className="panel-card embed-settings"><Palette size={18} /><div><strong>Embed configuration is stored per surface</strong><p>These controls are saved with the next generated widget and remain retrievable with its snippet.</p></div><a className="button button-quiet button-small" href={`/api/public/${eventSlug}/feed/sessions`} target="_blank" rel="noreferrer">Open JSON feed <ExternalLink size={13} /></a>
      <div className="embed-builder-controls"><label>Accent color<input aria-label="Embed accent color" type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /></label><label>Track filter<select value={trackFilter} onChange={(event) => setTrackFilter(event.target.value)}><option value="all">All tracks</option>{resource.data.tracks.map((track) => <option key={track.id} value={String(track.name)}>{track.name}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={showBranding} onChange={(event) => setShowBranding(event.target.checked)} /> Show Event Manager OS branding</label>
        <fieldset><legend>Visible fields</legend>{["title", "speaker", "track", "room", "format", "description"].map((field) => <label className="check-label" key={field}><input type="checkbox" checked={visibleFields.includes(field)} onChange={() => setVisibleFields((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field])} /> {field}</label>)}</fieldset></div></section>
  </div>;
}
