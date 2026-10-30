"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/** Native <dialog>: focus trap, Escape to close and inert background come from the browser. */
export function Dialog({ open, onClose, title, description, children, wide }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal() focuses the first control (the close button); focus the first form field instead.
      d.querySelector<HTMLElement>("input:not([readonly]), select, textarea")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className={cn("m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-border bg-bg p-0 text-fg",
        wide ? "w-[min(90rem,calc(100vw-2rem))]" : "w-[min(32rem,calc(100vw-2rem))]")}>
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", danger, loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string;
  confirmLabel?: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
