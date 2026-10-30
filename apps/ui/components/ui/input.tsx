import { cn } from "@/lib/utils";

const base =
  "h-9 w-full rounded-md border border-border bg-bg px-3 text-sm placeholder:text-muted disabled:opacity-50";

export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...p} />;
}

export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, "pr-8", className)} {...p} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}
