import { CircleAlert, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export type Row = Record<string, any>;

export function LoadingBlock({ label = "Loading workspace data…" }: { label?: string }) {
  return <div className="panel-state"><LoaderCircle className="spinner" size={20} /><span>{label}</span></div>;
}

export function ErrorBlock({ message }: { message: string }) {
  return <div className="panel-state error"><CircleAlert size={20} /><span>{message}</span></div>;
}

export function EmptyBlock({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><strong>{title}</strong><p>{children}</p></div>;
}

export function StatusChip({ value }: { value: unknown }) {
  const label = String(value ?? "unknown").replaceAll("_", " ");
  return <span className={`state-pill state-${String(value ?? "unknown")}`}>{label}</span>;
}

export function Notice({ children, tone = "success" }: { children: ReactNode; tone?: "success" | "warning" | "neutral" }) {
  return <div className={`notice notice-${tone}`} role="status">{children}</div>;
}

export function formatDate(value: unknown, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "Not set";
  const raw = String(value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = new Date(dateOnly ? `${raw}T12:00:00Z` : raw);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    ...(options ?? { month: "short", day: "numeric", year: "numeric" }),
    timeZone: options?.timeZone ?? (dateOnly ? "UTC" : "America/Los_Angeles"),
  }).format(date);
}

export function formatDateTime(value: unknown) {
  return formatDate(value, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
