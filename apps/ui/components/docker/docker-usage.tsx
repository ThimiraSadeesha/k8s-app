"use client";

import { Gauge as GaugeIcon, LineChart as LineChartIcon } from "lucide-react";
import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { LineChart } from "@/components/ui/chart";
import { Gauge } from "@/components/ui/gauge";
import { Select } from "@/components/ui/input";
import { fmtBytes, fmtPct, pctOf } from "@/lib/format";
import { useOverview } from "@/lib/overview";
import { cn } from "@/lib/utils";

const ALL = "all";

/** Usage of all of Docker together, or of one container, as meters or charts. */
export function DockerUsage() {
  const { data, dockerHistory, containerHistory } = useOverview();
  const [view, setView] = useState<"meters" | "charts">("meters");
  const [sel, setSel] = useState(ALL);
  if (!data?.docker_available) return null;

  const running = data.containers.filter((c) => c.metrics).sort((a, b) => a.name.localeCompare(b.name));
  const one = sel === ALL ? null : running.find((c) => c.docker_id === sel) ?? null;
  const cores = data.facts?.cpu_count ?? 1;
  const hostMem = data.metrics?.mem_total ?? null;
  const hist = one ? containerHistory[one.docker_id] ?? [] : dockerHistory;
  const last = hist[hist.length - 1];

  // Gauges are % of the whole machine (CPU: of all cores), so Docker and a container read alike.
  const cpuRaw = one ? one.metrics?.cpu_pct ?? null : last?.cpu ?? null; // % of one core
  const cpuPct = cpuRaw == null ? null : Math.min(100, cpuRaw / cores);
  const memBytes = one ? one.metrics?.mem_used ?? null : last?.mem ?? null;
  const memLimit = one?.metrics?.mem_limit && (!hostMem || one.metrics.mem_limit < hostMem) ? one.metrics.mem_limit : hostMem;
  const memPct = pctOf(memBytes, memLimit);
  const memLabel = one && memLimit !== hostMem ? "Memory (of its limit)" : "Memory (of host)";

  const title = one ? one.name : `All Docker (${running.length} running)`;
  const pts = (f: (s: (typeof hist)[number]) => number) => hist.map((s) => ({ t: s.t, v: f(s) }));
  const netNow = one?.metrics ?? (last ? { net_rx_bytes: last.rx, net_tx_bytes: last.tx } : null);

  return (
    <Card>
      <CardHeader title="Docker usage"
        description={view === "meters"
          ? `${title}. Bands: Low under 25%, Normal to 60%, High to 85%, Critical above.`
          : `${title}. Sampled every 10 seconds while this page is open, kept in your browser tab only.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Show usage for" className="h-8 w-52 text-xs" value={one ? sel : ALL} onChange={(e) => setSel(e.target.value)}>
              <option value={ALL}>All Docker (total)</option>
              {running.map((c) => <option key={c.docker_id} value={c.docker_id}>{c.name}</option>)}
            </Select>
            <div role="group" aria-label="View as" className="flex rounded-md border border-border p-0.5 text-xs">
              {([["meters", "Meters", GaugeIcon], ["charts", "Charts", LineChartIcon]] as const).map(([v, label, Icon]) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                  className={cn("flex items-center gap-1.5 rounded px-3 py-1.5", view === v ? "bg-fg text-bg" : "text-muted hover:text-fg")}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />{label}
                </button>))}
            </div>
          </div>} />
      {!running.length ? <p className="px-5 py-8 text-center text-sm text-muted">No running containers to measure.</p> : view === "meters" ? (
        <div className="grid gap-8 p-6 sm:grid-cols-2">
          <Gauge label="CPU (of host)" pct={cpuPct} hint={cpuRaw == null ? undefined : `${fmtPct(cpuRaw)} of one core · ${cores} core${cores === 1 ? "" : "s"}`} />
          <Gauge label={memLabel} pct={memPct} hint={`${fmtBytes(memBytes)}${memLimit ? ` of ${fmtBytes(memLimit)}` : ""}`} />
          <p className="text-center text-xs text-muted sm:col-span-2">Network since the container(s) started: ↓ {fmtBytes(netNow?.net_rx_bytes)} · ↑ {fmtBytes(netNow?.net_tx_bytes)}</p>
        </div>
      ) : (
        <div className="grid gap-6 p-5 md:grid-cols-2">
          <LineChart label="CPU (% of one core)" points={pts((s) => s.cpu)} format={fmtPct} />
          <LineChart label="Memory" points={pts((s) => s.mem)} format={fmtBytes} max={memLimit ?? undefined} />
        </div>
      )}
    </Card>
  );
}
