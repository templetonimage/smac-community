// Reference only: the Security Stage 2b/3 pieces of SMAC's functions/index.js.
// Full file is not in GitHub. Requires: const { onCall, HttpsError } = require("firebase-functions/v2/https");

/** Fetches all members with smsOptIn: true — includes Pro members and SMS add-on holders. */
async function getOptedInMembers() {
  // Query 1: Pro members with SMS opt-in
  const proSnap = await db
    .collection("smac_registry")
    .where("isPro", "==", true)
    .where("smsOptIn", "==", true)
    .get();

  // Query 2: Base members with SMS add-on and opt-in
  const smsSnap = await db
    .collection("smac_registry")
    .where("hasSMS", "==", true)
    .where("smsOptIn", "==", true)
    .get();

  const seen = new Set();
  const optedIn = [];

  for (const snap of [proSnap, smsSnap]) {
    snap.forEach((doc) => {
      if (seen.has(doc.id)) return; // dedupe Pro members who also have hasSMS
      seen.add(doc.id);
      optedIn.push({ id: doc.id, data: doc.data() });
    });
  }

  // Security Stage 2b: phone numbers live in smac_private/{authUid}, not on the
  // registry doc (which every member can read). Fall back to a legacy registry
  // phone for anyone not migrated yet.
  const uids = optedIn.map((m) => m.data.uid).filter(Boolean);
  const privRefs = uids.map((uid) => db.collection("smac_private").doc(uid));
  const privSnaps = privRefs.length ? await db.getAll(...privRefs) : [];
  const privPhone = new Map(privSnaps.filter((s) => s.exists).map((s) => [s.id, s.data().phone || ""]));

  const members = [];
  for (const m of optedIn) {
    const phone = (m.data.uid && privPhone.get(m.data.uid)) || m.data.phone || "";
    if (phone) members.push({ id: m.id, name: m.data.name || "Member", phone });
    else console.warn(`SMS: opted-in member ${m.id} has no phone on file — skipped.`);
  }
  return members;
}


// ─────────────────────────────────────────────────────────────────────────────
//  FUNCTION: createMemberAccount  (Security Stage 3)
//  Called from the platform's Directory → "Create Member Account" form.
//  Admin-only. Uses the Admin SDK, so it works with public sign-up turned OFF.
//  Checks the registry for the email FIRST, then creates the Auth user, then the
//  registry doc keyed by the new Auth UID (same shape as stripeWebhook's new-member doc).
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = "nate@templetonimage.com";
const ALLOWED_ROUNDS = ["R2", "R3", "R4"];

async function createMemberAccountHandler(request, deps = { auth: admin.auth(), db }) {
  const caller = request.auth;
  if (!caller || (caller.token?.email || "").toLowerCase() !== ADMIN_EMAIL) {
    throw new HttpsError("permission-denied", "Only the admin can create member accounts.");
  }

  const d = request.data || {};
  const str = (v, max) => String(v ?? "").trim().slice(0, max);
  const name     = str(d.name, 120);
  const email    = str(d.email, 254).toLowerCase();
  const password = String(d.password ?? "");
  const ig       = str(d.ig, 60);
  const business = str(d.business, 160);
  const type     = str(d.type, 60);
  const isFounder = d.isFounder === true;
  const isVIP     = d.isVIP === true;
  const rounds = isFounder
    ? [...ALLOWED_ROUNDS]
    : (Array.isArray(d.rounds) ? d.rounds.filter(r => ALLOWED_ROUNDS.includes(r)) : []);

  if (!name || !email) throw new HttpsError("invalid-argument", "Name and email are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError("invalid-argument", "That email address doesn't look valid.");
  if (password.length < 8) throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");

  const existing = await deps.db.collection("smac_registry").where("email", "==", email).limit(1).get();
  if (!existing.empty) throw new HttpsError("already-exists", `${email} is already in the registry.`);

  let userRecord;
  try {
    userRecord = await deps.auth.createUser({ email, password, displayName: name });
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "That email already has a login. Use a different email or reset their password.");
    }
    if (err.code === "auth/invalid-password") throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
    console.error("createMemberAccount: Auth error", err.code, err.message);
    throw new HttpsError("internal", "Could not create the login: " + (err.message || "unknown error"));
  }

  const member = {
    name, email, ig, business, type, uid: userRecord.uid,
    isFounder, isVIP, isAllStar: false, rounds, points: 0, totalPosts: 0,
    addedAt: Date.now(), createdBy: "admin",
  };
  try {
    await deps.db.collection("smac_registry").doc(userRecord.uid).set(member);
  } catch (err) {
    console.error("createMemberAccount: registry write failed for", email, err.message);
    throw new HttpsError("internal", "Login created, but the registry entry failed: " + err.message);
  }

  console.log(`✅ Admin created member ${email} (uid=${userRecord.uid}, rounds=${rounds.join(",") || "none"})`);
  return { uid: userRecord.uid, rounds };
}

exports.createMemberAccount = onCall((request) => createMemberAccountHandler(request));
