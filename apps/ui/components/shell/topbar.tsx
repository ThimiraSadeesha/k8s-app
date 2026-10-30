"use client";

import { LogOut, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useOverview } from "@/lib/overview";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { ThemeToggle } from "../ui/theme-toggle";
import { NAV } from "./nav";

export function Topbar() {
  const { me, logout } = useAuth();
  const { refresh, refreshing, error } = useOverview();
  const router = useRouter();
  const path = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[110rem] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-[0.3em]">ZENT</Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.label} href={n.href} aria-current={active ? "page" : undefined}
                className={cn("flex items-center gap-2 rounded-md px-3 py-1.5 text-sm",
                  active ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg")}>
                <Icon className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex min-w-0 items-center gap-2 text-sm" title={error ? "Cannot read the server right now" : "Connected over SSH"}>
            <span className={cn("h-2 w-2 rounded-full", error ? "bg-bad" : "bg-ok")} aria-hidden />
            <span className="max-w-[9rem] truncate font-mono text-xs sm:max-w-[22rem]">{me?.username}@{me?.host}{me && me.port !== 22 ? `:${me.port}` : ""}</span>
          </span>
          <Button variant="ghost" size="icon" aria-label="Refresh now" title="Refresh now" onClick={() => void refresh()}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out"
            onClick={async () => { await logout(); router.replace("/login"); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
