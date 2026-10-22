// Unit test for createMemberAccount: real index.js, real firebase-functions, firebase-admin faked.
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

// ── Fake Admin SDK ───────────────────────────────────────
const state = { users: new Map(), registry: new Map() };
const fakeDb = {
  collection(name) {
    return {
      where(field, op, val) {
        return { limit() { return { async get() {
          const hits = [...state.registry.values()].filter(d => d[field] === val);
          return { empty: hits.length === 0, docs: hits.map(h => ({ data: () => h })) };
        } }; } };
      },
      doc(id) { return { async set(data) { state.registry.set(id, data); }, ref: {} }; },
    };
  },
};
const fakeAuth = {
  async createUser({ email, password }) {
    if ([...state.users.values()].includes(email)) { const e = new Error("exists"); e.code = "auth/email-already-exists"; throw e; }
    const uid = "uid" + (state.users.size + 1); state.users.set(uid, email); return { uid, email };
  },
};
const adminPath = require.resolve("firebase-admin");
require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true,
  exports: { initializeApp() {}, firestore: Object.assign(() => fakeDb, { FieldValue: { serverTimestamp: () => "ts" } }), auth: () => fakeAuth } };

const fns = require(path.resolve(__dirname, process.env.FN_FILE || "index.js"));
const call = (data, email) => fns.createMemberAccount.run({ data, auth: email ? { uid: "callerUid", token: { email } } : undefined });
const base = { name: "Jane Doe", email: "Jane@Example.com", password: "Smacabc123!", ig: "@jane", business: "Jane Co", type: "Photographer", rounds: ["R4", "R9"] };

test("rejects signed-out caller", async () => { await assert.rejects(call(base, null), { code: "permission-denied" }); });
test("rejects non-admin member", async () => { await assert.rejects(call(base, "alice@x.com"), { code: "permission-denied" }); });
test("rejects lookalike admin email", async () => { await assert.rejects(call(base, "nate@templetonimage.com.evil.com"), { code: "permission-denied" }); });
test("rejects short password", async () => { await assert.rejects(call({ ...base, password: "short" }, "nate@templetonimage.com"), { code: "invalid-argument" }); });
test("rejects missing email", async () => { await assert.rejects(call({ ...base, email: "" }, "nate@templetonimage.com"), { code: "invalid-argument" }); });
test("admin creates member: Auth user + registry doc keyed by uid", async () => {
  const res = await call(base, "nate@templetonimage.com");
  assert.strictEqual(res.uid, "uid1");
  const doc = state.registry.get("uid1");
  assert.strictEqual(doc.email, "jane@example.com");
  assert.deepStrictEqual(doc.rounds, ["R4"]); // unknown round R9 dropped
  assert.strictEqual(doc.isFounder, false);
  assert.strictEqual(doc.points, 0);
  assert.strictEqual(state.users.get("uid1"), "jane@example.com");
});
test("duplicate registry email blocked BEFORE creating a login", async () => {
  const before = state.users.size;
  await assert.rejects(call(base, "nate@templetonimage.com"), { code: "already-exists" });
  assert.strictEqual(state.users.size, before);
});
test("existing login (not in registry) reported clearly", async () => {
  state.users.set("uidX", "loginonly@x.com");
  await assert.rejects(call({ ...base, email: "loginonly@x.com" }, "nate@templetonimage.com"), { code: "already-exists" });
});
test("founder gets all rounds", async () => {
  const res = await call({ ...base, email: "f@x.com", isFounder: true, rounds: [] }, "Nate@TempletonImage.com");
  assert.deepStrictEqual(state.registry.get(res.uid).rounds, ["R2", "R3", "R4"]);
});
test("all original exports still present", () => {
  for (const n of ["sendToMake", "onCorrectionCreated", "stripeWebhook", "smsSendDay4Reminder", "smsSendFinalCall", "onRestartWritten", "createMemberAccount"])
    assert.ok(fns[n], "missing export " + n);
});
