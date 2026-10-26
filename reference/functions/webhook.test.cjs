// stripeWebhook tests: real index.js + real firebase-functions; Admin SDK, Stripe, nodemailer, axios faked.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const Module = require("node:module");

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"; process.env.GMAIL_APP_PASSWORD = "x"; process.env.MAILERLITE_API_KEY = "x";

// ── fake state ──
let reg, users, sent, nextUid;
function reset() {
  reg = new Map(); users = new Map(); sent = []; nextUid = 1;
  // Existing member keyed by Auth UID (Stripe-era signup)
  users.set("uidAlice", "alice@x.com");
  reg.set("uidAlice", { name: "Alice", email: "alice@x.com", uid: "uidAlice", points: 140, rounds: ["R3", "R4"], isPro: true });
  // Legacy member: random doc ID, uid field set
  users.set("uidLegacy", "legacy@x.com");
  reg.set("randDoc1", { name: "Leg", email: "legacy@x.com", uid: "uidLegacy", points: 80, rounds: ["R4"] });
  // Login exists, but registry doc is keyed elsewhere with a different email on file (edge)
  users.set("uidOdd", "odd-login@x.com");
  reg.set("randDoc2", { name: "Odd", email: "odd-other@x.com", uid: "uidOdd", points: 33, rounds: ["R4"] });
  // Login exists with no registry doc at all
  users.set("uidOrphan", "orphan@x.com");
}
const snapOf = (pairs) => ({ empty: pairs.length === 0, docs: pairs.map(([id, d]) => ({ id, data: () => d, ref: docRef(id) })) });
function docRef(id) {
  return {
    async create(d) { if (reg.has(id)) { const e = new Error("6 ALREADY_EXISTS: Document already exists"); e.code = 6; throw e; } reg.set(id, d); },
    async set(d) { reg.set(id, d); },
    async update(u) { reg.set(id, { ...reg.get(id), ...u }); },
  };
}
const fakeDb = {
  collection() {
    return {
      where(f, op, v) { return { limit() { return { async get() { return snapOf([...reg.entries()].filter(([, d]) => d[f] === v).slice(0, 1)); } }; } }; },
      doc: (id) => docRef(id),
    };
  },
};
const fakeAuth = {
  async createUser({ email }) {
    if ([...users.values()].includes(email)) { const e = new Error("exists"); e.code = "auth/email-already-exists"; throw e; }
    const uid = "uidNew" + nextUid++; users.set(uid, email); return { uid };
  },
  async getUserByEmail(email) { const hit = [...users.entries()].find(([, e]) => e === email); return { uid: hit[0] }; },
  async generatePasswordResetLink(email) { return "https://smac-2026.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=TEST&email=" + encodeURIComponent(email); },
};
const fakes = {
  "firebase-admin": { initializeApp() {}, firestore: Object.assign(() => fakeDb, { FieldValue: { serverTimestamp: () => "ts" } }), auth: () => fakeAuth },
  stripe: () => ({ webhooks: { constructEvent: (body) => JSON.parse(body) }, checkout: { sessions: { listLineItems: async () => ({ data: [] }) } } }),
  nodemailer: { createTransport: () => ({ sendMail: async (m) => { sent.push(m); } }) },
  axios: { post: async () => ({}) },
};
const origReq = Module.prototype.require;
Module.prototype.require = function (id) { return id in fakes ? fakes[id] : origReq.apply(this, arguments); };
const fns = require(path.resolve(__dirname, process.env.FN_FILE || "index.js"));

function call(sessionOverrides) {
  const session = { id: "cs_test", metadata: { product: "smac_base", round: "r4" }, customer_details: { email: "payer@x.com", name: "New Person" }, custom_fields: [], ...sessionOverrides };
  const body = JSON.stringify({ type: "checkout.session.completed", data: { object: session } });
  return new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, send(t) { resolve({ code: this.code, text: t }); } };
    fns.stripeWebhook({ method: "POST", headers: { "stripe-signature": "t" }, rawBody: Buffer.from(body), body: JSON.parse(body) }, res);
  });
}
const loginField = (v) => [{ key: "loginemail", label: { custom: "Login email" }, type: "text", text: { value: v } }];

beforeEach(reset);

test("ATTACK: login email = existing member (UID-keyed) → treated as renewal, record NOT reset", async () => {
  const r = await call({ custom_fields: loginField("alice@x.com") });
  assert.strictEqual(reg.get("uidAlice").points, 140);
  assert.deepStrictEqual(reg.get("uidAlice").rounds, ["R3", "R4"]);
  assert.match(r.text, /renewal/i);
});
test("ATTACK: login email = legacy member → renewal on their doc, no new doc created", async () => {
  const before = reg.size;
  await call({ custom_fields: loginField("legacy@x.com") });
  assert.strictEqual(reg.size, before);
  assert.strictEqual(reg.get("randDoc1").points, 80);
});
test("ATTACK: login exists, registry doc found only by uid → not overwritten, flagged", async () => {
  const r = await call({ custom_fields: loginField("odd-login@x.com") });
  assert.strictEqual(reg.get("randDoc2").points, 33);
  assert.ok(!reg.has("uidOdd"));
  assert.match(r.text, /manual review/i);
});
test("ATTACK: login email = admin → admin login not given a registry doc, flagged", async () => {
  users.set("uidAdmin", "nate@templetonimage.com");
  reg.set("uidAdmin", { name: "Nate", email: "nate@templetonimage.com", uid: "uidAdmin", points: 0 });
  await call({ custom_fields: loginField("nate@templetonimage.com") });
  assert.strictEqual(reg.get("uidAdmin").points, 0);
  assert.strictEqual(sent.filter(m => /Welcome/.test(m.subject)).length, 0);
});
test("Login exists with no registry doc → registry doc created (create(), not set())", async () => {
  await call({ custom_fields: loginField("orphan@x.com") });
  assert.ok(reg.has("uidOrphan"));
});
test("New signup: registry doc created + welcome email has set-password link, no password", async () => {
  const r = await call({});
  assert.match(r.text, /New member account created/);
  const newId = [...reg.keys()].find(k => k.startsWith("uidNew"));
  assert.strictEqual(reg.get(newId).email, "payer@x.com");
  const welcome = sent.find(m => /Welcome/.test(m.subject));
  assert.ok(welcome, "welcome email sent");
  assert.match(welcome.html, /Set your password/);
  assert.match(welcome.html, /oobCode=TEST/);
  assert.doesNotMatch(welcome.html, /Password:<\/strong>/);
});
test("Existing member paying with own email → normal renewal path unchanged", async () => {
  const r = await call({ customer_details: { email: "alice@x.com", name: "Alice" }, metadata: { product: "smac_base", round: "r5" } });
  assert.match(r.text, /renewal/i);
  assert.deepStrictEqual(reg.get("uidAlice").rounds, ["R3", "R4", "R5"]);
  assert.strictEqual(reg.get("uidAlice").points, 140);
});
