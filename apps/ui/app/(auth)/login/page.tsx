"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Me } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const { setMe } = useAuth();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api<Me>("/auth/login", {
        method: "POST",
        body: { host: host.trim(), port: Number(port) || 22, username: username.trim(), password, host_key_fingerprint: fingerprint },
      });
      setPassword("");
      setMe(me);
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError && err.code === "host_key_unverified") {
        // First contact (or the key changed): show the fingerprint and wait for the operator.
        setFingerprint((err.details as { fingerprint: string }).fingerprint);
        setError(err.message);
      } else if (err instanceof ApiError) {
        setFingerprint(null);
        setError(err.status === 429 ? "Too many attempts. Try again later." : err.message);
      } else setError("Cannot reach the ZENT API.");
    } finally {
      setBusy(false);
    }
  }

  const changed = () => setFingerprint(null); // editing the target invalidates a confirmed key
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-[0.4em]">ZENT</h1>
          <p className="mt-2 text-sm text-muted">Connect to a server over SSH. Nothing is saved.</p>
        </div>
        <div className="grid grid-cols-[1fr_5.5rem] gap-3">
          <Field label="Host"><Input required autoFocus placeholder="203.0.113.10 or server.example.com" autoComplete="off" value={host} onChange={(e) => { setHost(e.target.value); changed(); }} /></Field>
          <Field label="Port"><Input required inputMode="numeric" pattern="[0-9]{1,5}" value={port} onChange={(e) => { setPort(e.target.value); changed(); }} /></Field>
        </div>
        <Field label="Username"><Input required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
        <Field label="Password"><Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {fingerprint && (
          <div className="rounded-md border border-warn/40 p-3 text-sm">
            <p className="font-medium">Verify the server&apos;s host key</p>
            <p className="mt-1 text-xs text-muted">Check this against the fingerprint of your server (<code>ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</code>). Your password is only sent once it matches.</p>
            <p className="mt-2 break-all font-mono text-xs">{fingerprint}</p>
          </div>
        )}
        {error && !fingerprint && <p role="alert" className="text-sm text-bad">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>{fingerprint ? "Trust this key and connect" : "Connect"}</Button>
      </form>
    </main>
  );
}
