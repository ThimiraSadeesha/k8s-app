"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api";
import type { Me } from "./types";

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  setMe: (me: Me | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

/** The session lives in the API's memory behind an HttpOnly cookie; nothing is kept in the browser. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch((e) => { if (!(e instanceof ApiError && e.status === 401)) console.error(e); setMe(null); })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, loading, setMe, logout }), [me, loading, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
