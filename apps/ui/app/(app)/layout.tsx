"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Topbar } from "@/components/shell/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthProvider, useAuth } from "@/lib/auth";
import { OverviewProvider } from "@/lib/overview";

function Guard({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);
  if (loading || !me)
    return <div className="p-8"><Skeleton className="h-8 w-48" /></div>;
  return (
    <OverviewProvider>
      <Topbar />
      <main className="mx-auto max-w-[110rem] p-4 sm:p-6 lg:px-8">{children}</main>
    </OverviewProvider>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider><Guard>{children}</Guard></AuthProvider>;
}
