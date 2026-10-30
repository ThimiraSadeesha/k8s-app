"use client";

import { Pause, Play, RotateCw, ScrollText, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import { Table, Td, Th } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { fmtBytes, fmtPct } from "@/lib/format";
import type { ContainerRow } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

type Action = "start" | "stop" | "restart" | "pause" | "unpause";
const done: Record<Action, string> = { start: "started", stop: "stopped", restart: "restarted", pause: "paused", unpause: "resumed" };

export function ContainerTable({ containers, onChanged }: { containers: ContainerRow[]; onChanged: () => void }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ c: ContainerRow; lines: string[] | null; error?: string } | null>(null);
  const [stopping, setStopping] = useState<ContainerRow | null>(null);
  const [remove, setRemove] = useState<ContainerRow | null>(null);

  const act = async (c: ContainerRow, action: Action) => {
    setBusyId(c.docker_id);
    try {
      await api(`/containers/${c.docker_id}/actions`, { method: "POST", body: { action } });
      toast(`${c.name} ${done[action]}`);
      onChanged();
    } catch (e) { toast(`${c.name}: ${e instanceof ApiError ? e.message : "action failed"}`, "bad"); }
    finally { setBusyId(null); setStopping(null); }
  };

  const openLogs = async (c: ContainerRow) => {
    setLogs({ c, lines: null });
    try {
      const r = await api<{ lines: string[] }>(`/containers/${c.docker_id}/logs`, { query: { tail: 300 } });
      setLogs({ c, lines: r.lines });
    } catch (e) { setLogs({ c, lines: [], error: e instanceof ApiError ? e.message : "Could not fetch logs" }); }
  };

  const doRemove = async () => {
    const c = remove!;
    setBusyId(c.docker_id);
    try {
      await api(`/containers/${c.docker_id}/remove`, { method: "POST", body: { force: c.state === "running" } });
      toast(`${c.name} removed`);
      onChanged();
    } catch (e) { toast(`${c.name}: ${e instanceof ApiError ? e.message : "remove failed"}`, "bad"); }
    finally { setBusyId(null); setRemove(null); }
  };

  if (!containers.length) return <EmptyState title="No containers" description="Docker has no containers on this server." />;
  return (
    <>
      <Table>
        <thead><tr><Th>Name</Th><Th>State</Th><Th>CPU</Th><Th>Memory</Th><Th className="hidden xl:table-cell">Ports</Th><Th className="hidden xl:table-cell">Started</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
        <tbody>{containers.map((c) => {
          const ports = [...new Set((c.ports ?? []).filter((p) => p.host_port).map((p) => `${p.host_port}→${p.container_port}`))];
          const busy = busyId === c.docker_id;
          const running = c.state === "running" || c.state === "restarting";
          return (
            <tr key={c.docker_id}>
              <Td><div className="font-medium">{c.name}</div>
                <div className="max-w-[16rem] truncate font-mono text-xs text-muted" title={c.image}>{c.image}</div></Td>
              <Td><div className="flex flex-wrap items-center gap-1"><StatusBadge status={c.state} />{c.health_status !== "none" && <StatusBadge status={c.health_status} />}</div>
                {c.restart_count > 0 && <div className="mt-1 text-xs text-muted">{c.restart_count} restarts</div>}</Td>
              <Td className="tabular-nums">{fmtPct(c.metrics?.cpu_pct)}</Td>
              <Td className="tabular-nums">{c.metrics ? `${fmtBytes(c.metrics.mem_used)}` : "—"}</Td>
              <Td className="hidden font-mono text-xs text-muted xl:table-cell">{ports.join(", ") || "—"}</Td>
              <Td className="hidden text-xs text-muted xl:table-cell">{c.state === "running" ? timeAgo(c.started_at) : "—"}</Td>
              <Td className="whitespace-nowrap text-right">
                <Button variant="ghost" size="icon" aria-label={`Logs for ${c.name}`} title="Logs" onClick={() => openLogs(c)}><ScrollText className="h-4 w-4" /></Button>
                {c.state === "paused"
                  ? <Button variant="ghost" size="icon" aria-label={`Resume ${c.name}`} title="Resume" disabled={busy} onClick={() => act(c, "unpause")}><Play className="h-4 w-4" /></Button>
                  : running
                    ? <Button variant="ghost" size="icon" aria-label={`Pause ${c.name}`} title="Pause" disabled={busy} onClick={() => act(c, "pause")}><Pause className="h-4 w-4" /></Button>
                    : null}
                {running || c.state === "paused"
                  ? <Button variant="ghost" size="icon" aria-label={`Stop ${c.name}`} title="Stop" disabled={busy} onClick={() => setStopping(c)}><Square className="h-4 w-4" /></Button>
                  : <Button variant="ghost" size="icon" aria-label={`Start ${c.name}`} title="Start" disabled={busy} onClick={() => act(c, "start")}><Play className="h-4 w-4" /></Button>}
                <Button variant="ghost" size="icon" aria-label={`Restart ${c.name}`} title="Restart" disabled={busy} onClick={() => act(c, "restart")}><RotateCw className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label={`Remove ${c.name}`} title="Remove" disabled={busy} onClick={() => setRemove(c)}><Trash2 className="h-4 w-4 text-bad" /></Button>
              </Td>
            </tr>);
        })}</tbody>
      </Table>

      <Dialog wide open={!!logs} onClose={() => setLogs(null)} title={`Logs: ${logs?.c.name ?? ""}`} description="Last 300 lines. Secrets are redacted.">
        {logs?.lines === null ? <p className="text-sm text-muted">Fetching…</p> : (
          <>
            {logs?.error && <p role="alert" className="mb-2 text-sm text-bad">{logs.error}</p>}
            <div className="mb-2 flex justify-end"><Button variant="outline" size="sm" onClick={() => logs && openLogs(logs.c)}>Reload</Button></div>
            <pre className="max-h-[55dvh] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed" tabIndex={0}>{logs?.lines?.length ? logs.lines.join("\n") : "No output."}</pre>
          </>)}
      </Dialog>
      <ConfirmDialog open={!!stopping} onClose={() => setStopping(null)} danger loading={busyId === stopping?.docker_id} confirmLabel="Stop container"
        title={`Stop ${stopping?.name ?? "container"}?`} description="The container stops until you start it again."
        onConfirm={() => stopping && act(stopping, "stop")} />
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} danger loading={busyId === remove?.docker_id} confirmLabel="Remove container"
        title={`Remove ${remove?.name ?? "container"}?`}
        description={remove?.state === "running" ? "It is running and will be force-removed. Its anonymous volumes may be lost." : "The container will be deleted. This cannot be undone."}
        onConfirm={doRemove} />
    </>
  );
}
