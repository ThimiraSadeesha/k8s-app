import { BANDS, bandOf, fmtPct, type Tone } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLOR: Record<Tone, string> = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)" };
const R = 80, C = 100;
const pt = (t: number, r = R) => {
  const a = Math.PI * (1 - t);
  return [C + r * Math.cos(a), C - r * Math.sin(a)] as const;
};
const arc = (t0: number, t1: number) => {
  const [x0, y0] = pt(t0), [x1, y1] = pt(t1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

/** Half-circle meter. The track shows the Low / Normal / High / Critical bands, the needle the current value. */
export function Gauge({ label, pct, hint }: { label: string; pct: number | null | undefined; hint?: string }) {
  const band = bandOf(pct);
  const t = pct == null ? 0 : Math.min(Math.max(pct, 0), 100) / 100;
  const [nx, ny] = pt(t, 66);
  return (
    <figure className="m-0 flex flex-col items-center" aria-label={`${label}: ${fmtPct(pct)}${band ? `, ${band.label}` : ""}`}>
      <svg viewBox="0 0 200 118" className="w-full max-w-[16rem]" role="img" aria-hidden>
        {BANDS.map((b) => (
          <path key={b.label} d={arc(b.from / 100, b.to / 100)} fill="none" strokeWidth={14}
            stroke={COLOR[b.tone]} opacity={band?.label === b.label ? 0.9 : 0.22} />
        ))}
        {pct != null && (
          <>
            <line x1={C} y1={C} x2={nx} y2={ny} stroke="var(--fg)" strokeWidth={3} strokeLinecap="round" />
            <circle cx={C} cy={C} r={6} fill="var(--fg)" />
          </>
        )}
        <text x={20} y={116} textAnchor="middle" fontSize={9} fill="var(--muted)">0</text>
        <text x={180} y={116} textAnchor="middle" fontSize={9} fill="var(--muted)">100</text>
      </svg>
      <div className="-mt-1 text-2xl font-semibold tabular-nums">{fmtPct(pct)}</div>
      <div className="mt-0.5 text-sm text-muted">{label}</div>
      {band && <span className={cn("mt-2 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        band.tone === "ok" ? "border-ok/40 text-ok" : band.tone === "warn" ? "border-warn/40 text-warn" : "border-bad/40 text-bad")}>{band.label}</span>}
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </figure>
  );
}

/** Thin horizontal bar coloured by the same bands. */
export function Bar({ pct, label }: { pct: number | null | undefined; label: string }) {
  const band = bandOf(pct);
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      {pct != null && band && <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(pct, 1))}%`, background: COLOR[band.tone] }} />}
    </div>
  );
}
