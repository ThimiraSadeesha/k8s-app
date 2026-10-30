import { gcm } from "@noble/ciphers/aes.js";
import { sha256 } from "@noble/hashes/sha2.js";

// Same scheme as apps/api/app/core/payload.py: {"d": base64url(nonce || AES-256-GCM(ciphertext+tag))},
// key = SHA-256(ENCRYPTION_KEY). Pure JS, so it also works on plain-HTTP origins where WebCrypto is unavailable.
const enc = new TextEncoder(), dec = new TextDecoder();
const REQ_AAD = enc.encode("zent-req-v1"), RES_AAD = enc.encode("zent-res-v1");

let keyPromise: Promise<Uint8Array | null> | null = null;
function getKey(): Promise<Uint8Array | null> {
  keyPromise ??= fetch("/zent-key", { cache: "no-store" })
    .then((r) => r.json())
    .then((j: { key: string | null }) => (j.key ? sha256(enc.encode(j.key)) : null))
    .catch(() => {
      keyPromise = null; // try again on the next request
      return null;
    });
  return keyPromise;
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
};

export async function encryptBody(value: unknown): Promise<string> {
  const key = await getKey();
  const json = JSON.stringify(value);
  if (!key) return json; // server has no key configured: plain JSON
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = gcm(key, nonce, REQ_AAD).encrypt(enc.encode(json));
  const out = new Uint8Array(12 + ct.length);
  out.set(nonce);
  out.set(ct, 12);
  return JSON.stringify({ d: toB64(out) });
}

/** Parses a response body, decrypting it when the API marked it encrypted. Returns undefined when empty. */
export async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  const j = JSON.parse(text);
  if (res.headers.get("x-zent-enc") !== "1") return j;
  const key = await getKey();
  if (!key) throw new Error("Encrypted response but no key available");
  const raw = fromB64(j.d);
  return JSON.parse(dec.decode(gcm(key, raw.slice(0, 12), RES_AAD).decrypt(raw.slice(12))));
}
