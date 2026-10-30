import { encryptBody, readBody } from "./payload";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string | null,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;
interface Opts {
  method?: "GET" | "POST";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

export async function api<T = void>(path: string, o: Opts = {}): Promise<T> {
  const res = await fetch(withQuery(`/api/v1${path}`, o.query), {
    method: o.method ?? "GET",
    headers: o.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin", // the session is an HttpOnly cookie
    signal: o.signal,
    body: o.body !== undefined ? await encryptBody(o.body) : undefined,
  });
  let payload: unknown;
  try {
    payload = await readBody(res);
  } catch {
    payload = undefined; // non-JSON or undecryptable body
  }
  if (res.ok) return payload as T;
  const err = (payload as { error?: { code?: string; message?: string; request_id?: string; details?: unknown } } | undefined)?.error;
  throw new ApiError(res.status, err?.code ?? "error", err?.message ?? `Request failed (${res.status})`, err?.request_id ?? null, err?.details);
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
