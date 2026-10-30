"use client";

import { useMemo, useState } from "react";
import { ContainerTable } from "@/components/containers/container-table";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useOverview } from "@/lib/overview";

export default function ContainersPage() {
  const { data, error, loading, refresh } = useOverview();
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const rows = useMemo(() => (data?.containers ?? [])
    .filter((c) => (!state || c.state === state) && (!q || `${c.name} ${c.image}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name)), [data, q, state]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Containers</h1>
        <Input aria-label="Search containers" placeholder="Search name or image" className="w-56" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Filter by state" className="w-40" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All states</option>
          {["running", "paused", "restarting", "exited", "created", "dead"].map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>
      <Card>
        {loading ? <div className="p-5"><Skeleton className="h-32 w-full" /></div>
          : !data ? <ErrorState error={error} retry={() => void refresh()} />
          : !data.docker_available ? <ErrorState error={null} retry={() => void refresh()} />
          : <ContainerTable containers={rows} onChanged={() => void refresh()} />}
      </Card>
    </div>
  );
}
