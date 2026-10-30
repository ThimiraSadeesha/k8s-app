import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-5xl font-semibold tabular-nums">404</p>
      <p className="text-sm text-muted">This page does not exist.</p>
      <Link href="/" className="rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-2">Back to overview</Link>
    </main>
  );
}
