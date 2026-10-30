// Hands the browser the payload key at runtime (read from the server's environment on every
// request, so it is never baked into the static bundle). It hides API traffic from the network
// tab; it is not a secret from anyone who can load the app.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ key: process.env.ENCRYPTION_KEY || null }, { headers: { "Cache-Control": "no-store" } });
}
