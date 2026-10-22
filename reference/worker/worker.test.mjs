import { test } from "node:test";
import assert from "node:assert";
import { webcrypto } from "node:crypto";

// ── Fake Google signing key + JWKS, fake Anthropic ──
const kp = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pubJwk = { ...(await webcrypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const evilKp = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function makeToken(claims = {}, { key = kp.privateKey, kid = "k1", alg = "RS256" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg, kid, typ: "JWT" }));
  const p = b64u(JSON.stringify({ aud: "smac-2026", iss: "https://securetoken.google.com/smac-2026", sub: "alice", iat: now - 10, exp: now + 3600, email: "a@x.com", ...claims }));
  const sig = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(h + "." + p));
  return `${h}.${p}.${b64u(sig)}`;
}
let upstreamCalls = [];
globalThis.fetch = async (url, init) => {
  if (String(url).includes("securetoken@system")) return new Response(JSON.stringify({ keys: [pubJwk] }), { headers: { "cache-control": "public, max-age=19000" } });
  if (String(url).includes("api.anthropic.com")) { upstreamCalls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 }); }
  throw new Error("unexpected fetch " + url);
};
const worker = (await import("./index.js")).default;
const env = { ANTHROPIC_KEY: "test-key" };
const goodBody = { model: "claude-haiku-4-5-20251001", max_tokens: 800, system: [{ type: "text", text: "s" }], messages: [{ role: "user", content: "hi" }] };
const req = (body, { token, origin = "https://app.joinsmac.com", method = "POST" } = {}) => new Request("https://smac-ai-proxy.templetonimage.workers.dev", {
  method, headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) },
  body: method === "POST" ? JSON.stringify(body) : undefined,
});
const realNow = Date.now;
const afterGrace = () => { Date.now = () => Date.parse("2026-10-23T00:00:00Z"); };
const restore = () => { Date.now = realNow; };

test("ALLOW member with valid token", async () => {
  upstreamCalls = [];
  const r = await worker.fetch(req(goodBody, { token: await makeToken() }), env);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(upstreamCalls.length, 1);
  assert.strictEqual(r.headers.get("Access-Control-Allow-Origin"), "https://app.joinsmac.com");
});
test("preflight allows Authorization header", async () => {
  const r = await worker.fetch(req(null, { method: "OPTIONS" }), env);
  assert.strictEqual(r.status, 204);
  assert.match(r.headers.get("Access-Control-Allow-Headers"), /Authorization/);
});
test("DENY no token after rollout window", async () => {
  afterGrace(); try {
    upstreamCalls = [];
    const r = await worker.fetch(req(goodBody), env);
    assert.strictEqual(r.status, 401); assert.strictEqual(upstreamCalls.length, 0);
  } finally { restore(); }
});
test("ALLOW no token during rollout window (limits still apply)", async () => {
  Date.now = () => Date.parse("2026-10-22T05:00:00Z"); try {
    const r = await worker.fetch(req(goodBody), env); assert.strictEqual(r.status, 200);
    const r2 = await worker.fetch(req({ ...goodBody, model: "claude-opus-4-1" }), env); assert.strictEqual(r2.status, 400);
  } finally { restore(); }
});
test("DENY token signed by someone else", async () => {
  const r = await worker.fetch(req(goodBody, { token: await makeToken({}, { key: evilKp.privateKey }) }), env); assert.strictEqual(r.status, 401);
});
test("DENY token from another Firebase project", async () => {
  const r = await worker.fetch(req(goodBody, { token: await makeToken({ aud: "other-proj", iss: "https://securetoken.google.com/other-proj" }) }), env); assert.strictEqual(r.status, 401);
});
test("DENY expired token", async () => {
  const r = await worker.fetch(req(goodBody, { token: await makeToken({ exp: Math.floor(Date.now() / 1000) - 5 }) }), env); assert.strictEqual(r.status, 401);
});
test("DENY alg=none / garbage token", async () => {
  const r = await worker.fetch(req(goodBody, { token: "abc.def.ghi" }), env); assert.strictEqual(r.status, 401);
});
test("DENY other model (e.g. Opus) even with token", async () => {
  const r = await worker.fetch(req({ ...goodBody, model: "claude-opus-4-1" }, { token: await makeToken() }), env); assert.strictEqual(r.status, 400);
});
test("max_tokens capped at 1500 and extra fields dropped", async () => {
  upstreamCalls = [];
  await worker.fetch(req({ ...goodBody, max_tokens: 64000, tools: [{ name: "x" }], stream: true }, { token: await makeToken() }), env);
  assert.strictEqual(upstreamCalls[0].max_tokens, 1500);
  assert.deepStrictEqual(Object.keys(upstreamCalls[0]).sort(), ["max_tokens", "messages", "model", "system"]);
});
test("DENY foreign website origin", async () => {
  const r = await worker.fetch(req(goodBody, { token: await makeToken(), origin: "https://evil.example.com" }), env); assert.strictEqual(r.status, 403);
});
test("DENY GET", async () => {
  const r = await worker.fetch(req(null, { method: "GET" }), env); assert.strictEqual(r.status, 405);
});
