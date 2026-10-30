"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils";

interface Toast { id: number; text: string; tone: "ok" | "bad" }
const Ctx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => undefined);
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, text, tone }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role="status"
            className={cn("rounded-md border bg-bg px-4 py-3 text-sm shadow-lg", t.tone === "ok" ? "border-border" : "border-bad text-bad")}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
