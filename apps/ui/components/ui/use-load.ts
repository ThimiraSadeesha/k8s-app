"use client";

import { useEffect, useRef, useState } from "react";
import { isAbort } from "@/lib/api";

/**
 * Loads data and cancels the in-flight request when inputs change or the component unmounts.
 * `deps` are compared by their JSON form; `reload` refetches. With `refreshMs`, data is refreshed
 * quietly in the background (no loading flash, a transient failure keeps the last good data) and
 * paused while the tab is hidden.
 */
export function useLoad<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[], opts?: { refreshMs?: number }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const latest = useRef(fn);
  const silent = useRef(false);
  useEffect(() => { latest.current = fn; });
  const key = JSON.stringify(deps);
  useEffect(() => {
    const ac = new AbortController();
    const quiet = silent.current;
    silent.current = false;
    if (!quiet) setLoading(true);
    latest.current(ac.signal)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => { if (!isAbort(e) && !quiet) setError(e); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [key, tick]);
  const refreshMs = opts?.refreshMs;
  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      silent.current = true;
      setTick((t) => t + 1);
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
