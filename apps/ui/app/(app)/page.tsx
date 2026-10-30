"use client";

import { Gauge as Gauge2, LineChart as LineChartIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DockerUsage } from "@/components/docker/docker-usage";
import { ContainerTable } from "@/components/containers/container-table";
import { Card, CardHeader, MetricCard } from "@/components/ui/card";
import { LineChart } from "@/components/ui/chart";
import { Gauge } from "@/components/ui/gauge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { fmtBytes, fmtPct, fmtRate, pctOf, uptime } from "@/lib/format";
import { useOverview } from "@/lib/overview";
import { cn } from "@/lib/utils";

export default function Overview() {
  const { data, error, loading, history, refresh } = useOverview();
  const [view, setView] = useState<"meters" | "charts">("meters");
  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
  if (!data) return <Card><ErrorState error={error} retry={() => void refresh()} /></Card>;

  const m = data.metrics, f = data.facts;
  const memPct = pctOf(m?.mem_used, m?.mem_total), diskPct = pctOf(m?.disk_used, m?.disk_total);
  const running = data.containers.filter((c) => c.state === "running").length;
  const stopped = data.containers.filter((c) => c.state === "exited").length;
  const unhealthy = data.containers.filter((c) => c.health_status === "unhealthy" || c.state === "dead").length;
  const attention = data.containers.filter((c) => c.state !== "running" || c.health_status === "unhealthy");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{f?.hostname ?? data.host}</h1>
        <p className="text-sm text-muted">{[f?.os_name, f?.kernel, f?.arch].filter(Boolean).join(" · ")}{f?.docker_version ? ` · Docker ${f.docker_version}` : ""}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Uptime" value={uptime(f?.boot_time)} />
        <MetricCard label="Containers" value={`${running} / ${data.containers.length}`} status={unhealthy ? "bad" : stopped ? "warn" : "ok"}
          hint={data.docker_available ? `${running} running · ${stopped} stopped${unhealthy ? ` · ${unhealthy} unhealthy` : ""}` : "Docker not available"} />
        <MetricCard label="Network in" value={fmtRate(m?.net_rx_bps)} />
        <MetricCard label="Network out" value={fmtRate(m?.net_tx_bps)} />
      </div>

      <Card>
        <CardHeader title="Resource usage"
          description={view === "meters"
            ? "Current usage. Bands: Low under 25%, Normal to 60%, High to 85%, Critical above."
            : "Sampled every 10 seconds while this page is open. Kept in your browser tab only."}
          action={
            <div role="group" aria-label="View as" className="flex rounded-md border border-border p-0.5 text-xs">
              {([["meters", "Meters", Gauge2], ["charts", "Charts", LineChartIcon]] as const).map(([v, label, Icon]) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                  className={cn("flex items-center gap-1.5 rounded px-3 py-1.5", view === v ? "bg-fg text-bg" : "text-muted hover:text-fg")}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />{label}
                </button>))}
            </div>} />
        {view === "meters" ? (
          <div className="grid gap-8 p-6 sm:grid-cols-3">
            <Gauge label="CPU" pct={m?.cpu_pct} />
            <Gauge label="Memory" pct={memPct} hint={`${fmtBytes(m?.mem_used)} of ${fmtBytes(m?.mem_total)}`} />
            <Gauge label="Disk (/)" pct={diskPct} hint={`${fmtBytes(m?.disk_used)} of ${fmtBytes(m?.disk_total)}`} />
          </div>
        ) : (
          <div className="grid gap-6 p-5 md:grid-cols-2 xl:grid-cols-4">
            <LineChart label="CPU" points={history.map((s) => ({ t: s.t, v: s.cpu }))} format={fmtPct} max={100} />
            <LineChart label="Memory" points={history.map((s) => ({ t: s.t, v: s.mem }))} format={fmtPct} max={100} />
            <LineChart label="Network in" points={history.map((s) => ({ t: s.t, v: s.rx }))} format={fmtRate} />
            <LineChart label="Network out" points={history.map((s) => ({ t: s.t, v: s.tx }))} format={fmtRate} />
          </div>
        )}
      </Card>

      <DockerUsage />

      <Card>
        <CardHeader title="Needs attention"
          description={data.docker_available ? "Containers that are stopped, paused, restarting or unhealthy." : "Docker is not available to this user"}
          action={<Link href="/containers" className="text-xs text-muted underline">All containers</Link>} />
        {!data.docker_available
          ? <ErrorState error={null} />
          : attention.length
            ? <ContainerTable containers={attention} onChanged={() => void refresh()} />
            : <p className="px-5 py-8 text-center text-sm text-muted">All {data.containers.length} containers are running and healthy.</p>}
      </Card>
    </div>
  );
}
