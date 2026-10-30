"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { useAuth } from "./auth";
import type { Overview } from "./types";

export interface Sample { t: number; cpu: number | null; mem: number | null; rx: number; tx: number }
/** One reading of a container, or of all of Docker together (summed). cpu is % of ONE core (as `docker stats`). */
export interface CSample { t: number; cpu: number; mem: number; rx: number; tx: number }

interface Ctx {
  data: Overview | null;
  error: unknown;
  loading: boolean;
  refreshing: boolean;
  history: Sample[]; // kept in this tab's memory only, gone on reload
  dockerHistory: CSample[]; // all containers summed
  containerHistory: Record<string, CSample[]>; // by docker id
  refresh: () => Promise<void>;
}

const C = createContext<Ctx | null>(null);
const EVERY_MS = 10_000;
const KEEP = 90; // ~15 minutes

export function OverviewProvider({ children }: { children: React.ReactNode }) {
  const { setMe } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<Sample[]>([]);
  const [dockerHistory, setDockerHistory] = useState<CSample[]>([]);
  const [containerHistory, setContainerHistory] = useState<Record<string, CSample[]>>({});
  const inflight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    inflight.current ??= (async () => {
      setRefreshing(true);
      try {
        const d = await api<Overview>("/overview");
        setData(d);
        setError(null);
        const now = Date.now();
        const live = d.containers.filter((c) => c.metrics);
        const sample = (c: { cpu_pct: number | null; mem_used: number | null; net_rx_bytes: number | null; net_tx_bytes: number | null }[]): CSample => ({
          t: now, cpu: c.reduce((a, x) => a + (x.cpu_pct ?? 0), 0), mem: c.reduce((a, x) => a + (x.mem_used ?? 0), 0),
          rx: c.reduce((a, x) => a + (x.net_rx_bytes ?? 0), 0), tx: c.reduce((a, x) => a + (x.net_tx_bytes ?? 0), 0),
        });
        setDockerHistory((h) => [...h, sample(live.map((c) => c.metrics!))].slice(-KEEP));
        setContainerHistory((h) => {
          const next: Record<string, CSample[]> = {};
          for (const c of live) next[c.docker_id] = [...(h[c.docker_id] ?? []), sample([c.metrics!])].slice(-KEEP);
          return next; // containers that are gone drop out
        });
        const m = d.metrics;
        if (m)
          setHistory((h) => [...h, {
            t: Date.now(), cpu: m.cpu_pct,
            mem: m.mem_total ? ((m.mem_used ?? 0) / m.mem_total) * 100 : null,
            rx: m.net_rx_bps ?? 0, tx: m.net_tx_bps ?? 0,
          }].slice(-KEEP));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setMe(null); // session expired
        else setError(e);
      } finally {
        setLoading(false);
        setRefreshing(false);
        inflight.current = null;
      }
    })();
    return inflight.current;
  }, [setMe]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, EVERY_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return <C.Provider value={{ data, error, loading, refreshing, history, dockerHistory, containerHistory, refresh }}>{children}</C.Provider>;
}

export function useOverview(): Ctx {
  const c = useContext(C);
  if (!c) throw new Error("useOverview outside OverviewProvider");
  return c;
}
