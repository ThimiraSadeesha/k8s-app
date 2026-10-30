import { AlertTriangle, Inbox } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Button } from "./button";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Inbox className="h-6 w-6 text-muted" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  if (!error)
    return (
      <div role="alert" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <AlertTriangle className="h-6 w-6 text-warn" aria-hidden />
        <p className="text-sm font-medium">Docker is not available</p>
        <p className="max-w-sm text-xs text-muted">Docker is not installed on this server, or this SSH user is not in the <code>docker</code> group.</p>
        {retry && <Button variant="outline" size="sm" onClick={retry}>Retry</Button>}
      </div>
    );
  const offline = !e;
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <AlertTriangle className="h-6 w-6 text-bad" aria-hidden />
      <p className="text-sm font-medium">{offline ? "Cannot reach the ZENT API" : e.message}</p>
      <p className="text-xs text-muted">
        {offline ? "The server may be down or unreachable." : e.requestId ? `Request ID ${e.requestId}` : `Error ${e.code}`}
      </p>
      {retry && <Button variant="outline" size="sm" onClick={retry}>Retry</Button>}
    </div>
  );
}
