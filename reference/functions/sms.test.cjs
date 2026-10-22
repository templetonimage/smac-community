const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const reg = [
  { id: "r1", d: { uid: "u1", name: "Pro Migrated", isPro: true, smsOptIn: true } },                       // phone only in private
  { id: "r2", d: { uid: "u2", name: "SMS Legacy", hasSMS: true, smsOptIn: true, phone: "+15550000002" } },  // not migrated yet
  { id: "r3", d: { uid: "u3", name: "Both", isPro: true, hasSMS: true, smsOptIn: true, phone: "+1OLD" } },  // private wins, deduped
  { id: "r4", d: { name: "No uid", isPro: true, smsOptIn: true, phone: "+15550000004" } },                  // legacy, no uid
  { id: "r5", d: { uid: "u5", name: "No phone", isPro: true, smsOptIn: true } },                           // skipped
  { id: "r6", d: { uid: "u6", name: "Opted out", isPro: true, smsOptIn: false, phone: "+15550000006" } },
];
const priv = { u1: { phone: "+15550000001" }, u3: { phone: "+15550000003" } };
const q = (filters) => ({
  where(f, op, v) { return q([...filters, [f, v]]); },
  async get() {
    const hits = reg.filter(r => filters.every(([f, v]) => r.d[f] === v));
    return { forEach: (cb) => hits.forEach(h => cb({ id: h.id, data: () => h.d })) };
  },
});
const fakeDb = {
  collection(name) {
    if (name === "smac_private") return { doc: (id) => ({ id }) };
    return q([]);
  },
  async getAll(...refs) { return refs.map(r => ({ id: r.id, exists: !!priv[r.id], data: () => priv[r.id] })); },
};
const adminPath = require.resolve("firebase-admin");
require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true,
  exports: { initializeApp() {}, firestore: Object.assign(() => fakeDb, { FieldValue: {} }), auth: () => ({}) } };
const fns = require(path.resolve(__dirname, "index_t.js"));

test("opted-in members get the right phone from private (with legacy fallback)", async () => {
  const m = await fns.__getOptedInMembers();
  const byId = Object.fromEntries(m.map(x => [x.id, x.phone]));
  assert.deepStrictEqual(byId, { r1: "+15550000001", r2: "+15550000002", r3: "+15550000003", r4: "+15550000004" });
  assert.strictEqual(m.length, 4); // r3 deduped, r5 no phone, r6 opted out
});
