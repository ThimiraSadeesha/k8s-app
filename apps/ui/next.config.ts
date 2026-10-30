import path from "node:path";
import type { NextConfig } from "next";

// The browser only ever talks to this origin; /api/v1/* is proxied to the FastAPI backend.
// That keeps session cookies same-origin and lets the CSRF cookie be read by the client.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Dev server only: any host may load dev resources (HMR) unless ALLOWED_DEV_ORIGINS lists some
  // (comma-separated). Has no effect on production builds.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : ["**.*"], // Next rejects a bare wildcard; this matches any dotted host (IPs, domains)
  output: "standalone", // minimal self-contained server for the production image
  turbopack: {
    root: path.resolve(import.meta.dirname),
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
