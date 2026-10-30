import { cn } from "@/lib/utils";

type Tone = "neutral" | "ok" | "warn" | "bad";
const tones: Record<Tone, string> = {
  neutral: "border-border text-muted",
  ok: "border-ok/40 text-ok",
  warn: "border-warn/40 text-warn",
  bad: "border-bad/40 text-bad",
};

export function Badge({ tone = "neutral", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...p} />;
}

const toneFor = (s: string): Tone =>
  ["ok", "success", "active", "info", "online", "running", "healthy", "succeeded", "resolved"].includes(s) ? "ok"
  : ["warning", "degraded", "mfa_failure", "locked", "pending", "paused", "restarting", "starting", "unknown", "acknowledged", "queued"].includes(s) ? "warn"
  : ["down", "critical", "failure", "revoked", "offline", "exited", "dead", "unhealthy", "failed", "open"].includes(s) ? "bad" : "neutral";

export const StatusBadge = ({ status }: { status: string }) => <Badge tone={toneFor(status)}>{status}</Badge>;
