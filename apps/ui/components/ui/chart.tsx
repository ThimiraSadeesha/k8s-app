"use client";

import { useState } from "react";

export interface ChartPoint { t: number; v: number | null }

/** Dependency-free line chart. Missing samples (null) break the line instead of being invented. */
export function LineChart({ points, label, format, max, height = 120 }: {
  points: ChartPoint[]; label: string; format: (n: number) => string; max?: number; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const valid = points.filter((p) => p.v != null) as { t: number; v: number }[];
  if (valid.length < 2)
    return <div className="flex items-center justify-center text-xs text-muted" style={{ height }} role="img" aria-label={`${label}: not enough data yet`}>Not enough data yet</div>;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const top = max ?? Math.max(...valid.map((p) => p.v), 1) * 1.15;
  const x = (t: number) => (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * W);
  const y = (v: number) => height - (Math.min(v, top) / top) * (height - 4) - 2;
  // Split into segments at gaps so null samples leave a visible hole.
  const segs: { t: number; v: number }[][] = [[]];
  for (const p of points) {
    if (p.v == null) segs.push([]);
    else segs[segs.length - 1].push({ t: p.t, v: p.v });
  }
  const line = (s: { t: number; v: number }[]) => s.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const h = hover != null ? valid[hover] : valid[valid.length - 1];
  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex items-baseline justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-fg">{format(h.v)} <span className="text-muted">· {new Date(h.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full overflow-visible text-fg" style={{ height }}
        role="img" aria-label={`${label}, latest ${format(valid[valid.length - 1].v)}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
          let best = 0;
          valid.forEach((p, i) => { if (Math.abs(p.t - t) < Math.abs(valid[best].t - t)) best = i; });
          setHover(best);
        }}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={W} y1={height * f} y2={height * f} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        {segs.filter((s) => s.length > 1).map((s, i) => (
          <g key={i}>
            <polygon points={`${x(s[0].t)},${height} ${line(s)} ${x(s[s.length - 1].t)},${height}`} fill="currentColor" opacity={0.08} />
            <polyline points={line(s)} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </g>))}
        {hover != null && <line x1={x(valid[hover].t)} x2={x(valid[hover].t)} y1={0} y2={height} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
    </figure>
  );
}
