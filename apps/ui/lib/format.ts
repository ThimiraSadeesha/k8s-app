export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export const fmtRate = (n: number | null | undefined) => (n == null ? "—" : `${fmtBytes(n)}/s`);
export const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(n >= 10 ? 0 : 1)}%`);

export const pctOf = (used: number | null | undefined, total: number | null | undefined) =>
  used != null && total ? (used / total) * 100 : null;

/** "3d 4h" style uptime from a boot timestamp. */
export function uptime(bootIso: string | null | undefined): string {
  if (!bootIso) return "—";
  const s = Math.max(0, (Date.now() - new Date(bootIso).getTime()) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export const level = (pct: number | null | undefined): "ok" | "warn" | "bad" =>
  pct == null ? "ok" : pct >= 90 ? "bad" : pct >= 75 ? "warn" : "ok";

/** "850 ms", "12 s", "3m 05s", "2h 10m", "4d 3h" from seconds. */
export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return "—";
  if (sec < 1) return `${Math.round(sec * 1000)} ms`;
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${String(Math.round(sec % 60)).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const fmtNum = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());

export type Tone = "ok" | "warn" | "bad";
export interface Band { label: "Low" | "Normal" | "High" | "Critical"; tone: Tone; from: number; to: number }
/** Usage bands shared by every meter: where the arc changes colour and what it is called. */
export const BANDS: Band[] = [
  { label: "Low", tone: "ok", from: 0, to: 25 },
  { label: "Normal", tone: "ok", from: 25, to: 60 },
  { label: "High", tone: "warn", from: 60, to: 85 },
  { label: "Critical", tone: "bad", from: 85, to: 100 },
];
export const bandOf = (pct: number | null | undefined): Band | null =>
  pct == null ? null : (BANDS.find((b) => pct < b.to) ?? BANDS[BANDS.length - 1]);
