// SMAC AI proxy (Cloudflare Worker) — Security Stage 4, Oct 2026
// - Only signed-in SMAC members: requires a valid Firebase ID token (project smac-2026)
// - Only the model and size the app uses; extra fields are dropped
// - CORS limited to the SMAC app
// The Anthropic key stays in the Worker secret ANTHROPIC_KEY (unchanged).

const PROJECT_ID = "smac-2026";
const ALLOWED_ORIGINS = ["https://app.joinsmac.com", "capacitor://localhost", "https://localhost"];
const ALLOWED_MODELS = ["claude-haiku-4-5-20251001"];
const MAX_TOKENS_CAP = 1500;               // largest the app asks for is 1200
const MAX_BODY_BYTES = 12 * 1024 * 1024;   // screenshots are sent as base64
// Rollout window: until this time, requests without a token are still served (model/size limits
// still apply) so members on the old page aren't cut off mid-update. After it, a token is required.
const GRACE_UNTIL = Date.parse("2026-10-22T08:00:00Z"); // 4:00 AM ET, Oct 22
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwksCache = { keys: null, exp: 0 };

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}
function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function getJwks(force) {
  const now = Date.now();
  if (!force && jwksCache.keys && jwksCache.exp > now) return jwksCache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error("jwks_fetch_failed");
  const j = await r.json();
  const m = /max-age=(\d+)/.exec(r.headers.get("cache-control") || "");
  jwksCache = { keys: j.keys || [], exp: now + (m ? Number(m[1]) * 1000 : 3600 * 1000) };
  return jwksCache.keys;
}
async function verifyFirebaseToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed");
  const dec = new TextDecoder();
  const header = JSON.parse(dec.decode(b64urlToBytes(parts[0])));
  const payload = JSON.parse(dec.decode(b64urlToBytes(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("bad_alg");
  let jwk = (await getJwks(false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await getJwks(true)).find((k) => k.kid === header.kid); // Google rotated keys
  if (!jwk) throw new Error("unknown_kid");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) throw new Error("bad_signature");
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT_ID || payload.iss !== "https://securetoken.google.com/" + PROJECT_ID) throw new Error("wrong_project");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("no_subject");
  if (typeof payload.exp !== "number" || payload.exp <= now) throw new Error("expired");
  if (typeof payload.iat !== "number" || payload.iat > now + 300) throw new Error("issued_in_future");
  return payload;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin_not_allowed" }, 403, origin);

    const len = Number(request.headers.get("Content-Length") || 0);
    if (len > MAX_BODY_BYTES) return json({ error: "request_too_large" }, 413, origin);

    // ── Who is calling ──
    const authz = request.headers.get("Authorization") || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    if (token) {
      try { await verifyFirebaseToken(token); }
      catch (e) { return json({ error: "unauthorized", reason: String(e.message || e) }, 401, origin); }
    } else if (Date.now() >= GRACE_UNTIL) {
      return json({ error: "unauthorized", reason: "sign_in_required" }, 401, origin);
    }

    // ── What they're asking for ──
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
    if (!body || !ALLOWED_MODELS.includes(body.model)) return json({ error: "model_not_allowed" }, 400, origin);
    if (!Array.isArray(body.messages) || body.messages.length === 0) return json({ error: "messages_required" }, 400, origin);
    const clean = {
      model: body.model,
      max_tokens: Math.max(1, Math.min(Number(body.max_tokens) || 800, MAX_TOKENS_CAP)),
      messages: body.messages,
    };
    if (body.system !== undefined) clean.system = body.system;

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify(clean),
    });
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
  },
};
