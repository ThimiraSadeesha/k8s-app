import { cn } from "@/lib/utils";

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)} {...p} />;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function MetricCard({ label, value, hint, status }: { label: string; value: React.ReactNode; hint?: string; status?: "ok" | "warn" | "bad" }) {
  const dot = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[status ?? "ok"];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-xs text-muted">
        {status && <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}
