// SMAC Firestore rules tests — runs against the Firestore emulator.
// Each "ALLOW" case mirrors a real write/read the platform makes; each "DENY" case is an abuse path.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, collection, getDocs, query, where,
  increment, arrayUnion, arrayRemove, serverTimestamp, deleteField,
} from "firebase/firestore";

let env;
const ADMIN = { uid: "adminUid", email: "nate@templetonimage.com" };
const ALICE = { uid: "alice", email: "alice@x.com" };
const BOB = { uid: "bob", email: "bob@x.com" };
const LEGACY = { uid: "legacyAuth", email: "Legacy@X.com" }; // registry doc has random id, no uid yet, lowercase email

const db = (u) => (u ? env.authenticatedContext(u.uid, { email: u.email }) : env.unauthenticatedContext()).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-smac",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, "smac_registry/regAlice"), { name: "Alice", email: "alice@x.com", uid: "alice", points: 50, totalPosts: 3, isPro: false, hasSMS: false, rounds: ["R4"], isFounder: false });
    await setDoc(doc(f, "smac_registry/bob"), { name: "Bob", email: "bob@x.com", uid: "bob", points: 20, isPro: true, rounds: ["R4"], phone: "+15555550100" });
    await setDoc(doc(f, "smac_registry/regLegacy"), { name: "Legacy", email: "legacy@x.com", points: 5, rounds: ["R4"] });
    await setDoc(doc(f, "smac_registry/regRevoked"), { name: "Rev", email: "rev@x.com", uid: "rev", points: 5, ambassadorRevoked: true });
    await setDoc(doc(f, "posts/postBob"), { author: "Bob", uid: "bob", text: "hi", link: "https://instagram.com/p/x", likes: 0, likedBy: [], props: 0, propsBy: [], propsNames: [] });
    await setDoc(doc(f, "chat_messages/msgBob"), { author: "Bob", uid: "bob", text: "yo", reactions: {}, replyCount: 0 });
    await setDoc(doc(f, "chat_messages/chatPoll"), { uid: "adminUid", question: "Q", votes: {} });
    await setDoc(doc(f, "polls/poll1"), { uid: "adminUid", question: "Q", votes: {} });
    await setDoc(doc(f, "submissions/subBob"), { uid: "bob", url: "https://instagram.com/p/b", pts: 10, round: "R4", weekIdx: 2 });
    await setDoc(doc(f, "submissions/subAlice"), { uid: "alice", url: "https://instagram.com/p/a", format: "single", pts: 10, challengeApplied: false, round: "R4", weekIdx: 2, reviewed: false });
    await setDoc(doc(f, "engagements/engAlice"), { uid: "alice", type: "comment", pts: 2 });
    await setDoc(doc(f, "trackers/alice"), { name: "Alice", uid: "alice", tracked: {}, overrides: { oct: 1 } });
    await setDoc(doc(f, "trackers/bob"), { name: "Bob", uid: "bob", tracked: {} });
    await setDoc(doc(f, "pro_plans/planBob"), { uid: "bob", plan: "secret" });
    await setDoc(doc(f, "analytics_snapshots/bob_R4_post"), { uid: "bob", data: 1 });
    await setDoc(doc(f, "smac_config/zoom_card"), { url: "https://calendar.app.google/x", visible: true });
    await setDoc(doc(f, "smac_coworking_sessions/s1"), { label: "Cowork", active: true });
    await setDoc(doc(f, "bug_reports/b1"), { uid: "bob", message: "bug" });
    await setDoc(doc(f, "corrections/c1"), { uid: "alice", reason: "dup" });
  });
});

// ── Outsiders ────────────────────────────────────────────
test("DENY signed-out read of registry", () => assertFails(getDoc(doc(db(null), "smac_registry/regAlice"))));
test("DENY signed-out write anywhere", () => assertFails(setDoc(doc(db(null), "posts/x"), { uid: "x" })));
test("DENY unknown collection, even for members", () => assertFails(setDoc(doc(db(ALICE), "evil/x"), { a: 1 })));
test("DENY unknown collection read", () => assertFails(getDoc(doc(db(ALICE), "evil/x"))));

// ── Registry: member paths the app uses ──────────────────
test("ALLOW member reads registry (directory/leaderboard)", () => assertSucceeds(getDocs(collection(db(ALICE), "smac_registry"))));
test("ALLOW login: stamp uid on legacy doc matched by email (case-insensitive)", () =>
  assertSucceeds(updateDoc(doc(db(LEGACY), "smac_registry/regLegacy"), { uid: "legacyAuth" })));
test("ALLOW login: lastLogin on own doc", () => assertSucceeds(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { lastLogin: Date.now() })));
test("ALLOW submit post: points +10 and totalPosts +1", () =>
  assertSucceeds(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { points: increment(10), totalPosts: increment(1) })));
test("ALLOW delete own submission: points -17", () =>
  assertSucceeds(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { points: increment(-17), totalPosts: increment(-1) })));
test("ALLOW SMS opt-in flag on registry", () => assertSucceeds(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { smsOptIn: true })));
test("ALLOW SMS unsubscribe", () => assertSucceeds(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { smsOptIn: false })));
test("DENY member writes phone onto registry (public)", () => assertFails(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { phone: "+15555550111" })));
test("ALLOW member saves own private phone", () => assertSucceeds(setDoc(doc(db(ALICE), "smac_private/alice"), { phone: "+15555550111", registryId: "regAlice", updatedAt: 1 }, { merge: true })));
test("ALLOW member updates own private phone", async () => {
  await setDoc(doc(db(ALICE), "smac_private/alice"), { phone: "+1", registryId: "regAlice", updatedAt: 1 });
  await assertSucceeds(setDoc(doc(db(ALICE), "smac_private/alice"), { phone: "+2", registryId: "regAlice", updatedAt: 2 }, { merge: true }));
});
test("ALLOW member reads own private phone", () => assertSucceeds(getDoc(doc(db(ALICE), "smac_private/alice"))));
test("DENY member reads another's private phone", () => assertFails(getDoc(doc(db(ALICE), "smac_private/bob"))));
test("DENY member lists private phones", () => assertFails(getDocs(collection(db(ALICE), "smac_private"))));
test("DENY member writes another's private phone", () => assertFails(setDoc(doc(db(ALICE), "smac_private/bob"), { phone: "+1" })));
test("DENY extra fields in private doc", () => assertFails(setDoc(doc(db(ALICE), "smac_private/alice"), { phone: "+1", isPro: true })));
test("ALLOW admin reads all private phones", () => assertSucceeds(getDocs(collection(db(ADMIN), "smac_private"))));
test("ALLOW admin migration: copy phone + remove from registry", async () => {
  await assertSucceeds(setDoc(doc(db(ADMIN), "smac_private/bob"), { phone: "+15555550100", registryId: "bob", updatedAt: 1 }, { merge: true }));
  await assertSucceeds(updateDoc(doc(db(ADMIN), "smac_registry/bob"), { phone: deleteField() }));
});
test("ALLOW profile save: ig + photoURL", () => assertSucceeds(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { ig: "alice", photoURL: "https://firebasestorage.googleapis.com/x" })));
test("ALLOW grace token spend", () => assertSucceeds(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { graceTokens: 1, points: increment(10) })));
test("ALLOW All-Star flag set true", () => assertSucceeds(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { isAllStar: true })));
test("ALLOW Ambassador award (+25)", () => assertSucceeds(updateDoc(doc(db(ALICE), "smac_registry/regAlice"),
  { ambassadorAwarded: true, ambassadorProofUrl: "data:image/jpeg;base64,AAAA", ambassadorProofAt: Date.now(), points: 75, restartPts: 25 })));

// ── Registry: abuse ──────────────────────────────────────
test("DENY member self-grants Pro", () => assertFails(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { isPro: true })));
test("DENY member self-grants SMS add-on", () => assertFails(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { hasSMS: true })));
test("DENY member adds a round", () => assertFails(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { rounds: ["R4", "R5"] })));
test("DENY member sets points +500", () => assertFails(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { points: 550 })));
test("DENY member edits another member's doc", () => assertFails(updateDoc(doc(db(ALICE), "smac_registry/bob"), { points: increment(1) })));
test("DENY member changes own email to someone else's", () => assertFails(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { email: "bob@x.com" })));
test("DENY member claims another uid", () => assertFails(updateDoc(doc(db(ALICE), "smac_registry/regAlice"), { uid: "bob" })));
test("DENY Ambassador re-award after revoke", () => assertFails(updateDoc(doc(db({ uid: "rev", email: "rev@x.com" }), "smac_registry/regRevoked"), { ambassadorAwarded: true, points: 30 })));
test("DENY member creates registry doc", () => assertFails(setDoc(doc(db(ALICE), "smac_registry/new"), { email: "z@x.com", isPro: true })));
test("DENY member deletes registry doc", () => assertFails(deleteDoc(doc(db(ALICE), "smac_registry/bob"))));

// ── Admin ────────────────────────────────────────────────
test("ALLOW admin toggles Pro on a member", () => assertSucceeds(updateDoc(doc(db(ADMIN), "smac_registry/bob"), { isPro: false })));
test("ALLOW admin creates registry doc", () => assertSucceeds(addDoc(collection(db(ADMIN), "smac_registry"), { email: "n@x.com", rounds: ["R4"] })));
test("ALLOW admin points reconciliation (big change)", () => assertSucceeds(updateDoc(doc(db(ADMIN), "smac_registry/regAlice"), { points: 400 })));
test("ALLOW admin writes Zoom card", () => assertSucceeds(setDoc(doc(db(ADMIN), "smac_config/zoom_card"), { url: "https://x.com", visible: true, title: "t", subtext: "s", updatedAt: 1 })));
test("ALLOW admin creates correction", () => assertSucceeds(addDoc(collection(db(ADMIN), "corrections"), { uid: "alice", reason: "x" })));
test("ALLOW admin reads bug reports", () => assertSucceeds(getDocs(collection(db(ADMIN), "bug_reports"))));
test("ALLOW admin edits tracker override", () => assertSucceeds(updateDoc(doc(db(ADMIN), "trackers/bob"), { "overrides.oct": 2 })));
test("DENY lookalike admin email", () => assertFails(setDoc(doc(db({ uid: "x", email: "Nate@templetonimage.com.evil.com" }), "smac_config/zoom_card"), { url: "https://phish" })));

// ── Config / content: members read only ──────────────────
test("ALLOW member reads Zoom card", () => assertSucceeds(getDoc(doc(db(ALICE), "smac_config/zoom_card"))));
test("DENY member rewrites Zoom card", () => assertFails(setDoc(doc(db(ALICE), "smac_config/zoom_card"), { url: "https://phish" })));
test("DENY member rewrites renewal modal", () => assertFails(setDoc(doc(db(ALICE), "smac_config/renew_modal"), { base_url: "https://phish" })));
test("DENY member creates correction (would send email)", () => assertFails(addDoc(collection(db(ALICE), "corrections"), { uid: "bob", reason: "phish" })));
test("DENY member creates announcement", () => assertFails(addDoc(collection(db(ALICE), "announcements"), { text: "x" })));
test("DENY member creates resource", () => assertFails(addDoc(collection(db(ALICE), "resources"), { title: "x" })));
test("DENY member creates spotlight", () => assertFails(addDoc(collection(db(ALICE), "spotlights"), { url: "x" })));
test("DENY member edits seats", () => assertFails(setDoc(doc(db(ALICE), "app_config/r3_seats"), { spots_left: 0 })));

// ── Feed ─────────────────────────────────────────────────
test("ALLOW member creates own post", () => assertSucceeds(addDoc(collection(db(ALICE), "posts"),
  { author: "Alice", uid: "alice", text: "t", link: "", ts: 1, likes: 0, likedBy: [], props: 0, propsBy: [], propsNames: [] })));
test("DENY member creates post as someone else", () => assertFails(addDoc(collection(db(ALICE), "posts"), { author: "Bob", uid: "bob", text: "t", likes: 0, props: 0 })));
test("ALLOW long-ish post (3,000 chars)", () => assertSucceeds(addDoc(collection(db(ALICE), "posts"),
  { author: "Alice", uid: "alice", text: "x".repeat(3000), link: "", ts: 1, likes: 0, likedBy: [], props: 0, propsBy: [], propsNames: [] })));
test("DENY 50,000-char post", () => assertFails(addDoc(collection(db(ALICE), "posts"),
  { author: "Alice", uid: "alice", text: "x".repeat(50000), link: "", ts: 1, likes: 0, props: 0 })));
test("DENY 50,000-char chat message", () => assertFails(addDoc(collection(db(ALICE), "chat_messages"),
  { author: "Alice", uid: "alice", text: "x".repeat(50000), ts: 1, reactions: {}, replyCount: 0 })));
test("DENY editing own post to 50,000 chars", () => assertFails(updateDoc(doc(db(BOB), "posts/postBob"), { text: "x".repeat(50000), editedAt: 1 })));
test("DENY huge bug report", () => assertFails(addDoc(collection(db(ALICE), "bug_reports"), { uid: "alice", message: "x".repeat(50000) })));
test("ALLOW bug report with screenshot field", () => assertSucceeds(addDoc(collection(db(ALICE), "bug_reports"), { name: "Alice", email: "alice@x.com", uid: "alice", message: "m", screenshot: null, resolved: false, ts: 1 })));
test("ALLOW member likes another's post", () => assertSucceeds(updateDoc(doc(db(ALICE), "posts/postBob"), { likes: 1, likedBy: ["alice"] })));
test("ALLOW member gives props", () => assertSucceeds(updateDoc(doc(db(ALICE), "posts/postBob"), { props: 1, propsBy: ["alice"], propsNames: ["Alice"] })));
test("DENY member edits another's post text", () => assertFails(updateDoc(doc(db(ALICE), "posts/postBob"), { text: "hacked" })));
test("DENY member swaps another's post link", () => assertFails(updateDoc(doc(db(ALICE), "posts/postBob"), { link: "https://phish" })));
test("DENY member deletes another's post", () => assertFails(deleteDoc(doc(db(ALICE), "posts/postBob"))));
test("ALLOW author edits own post", () => assertSucceeds(updateDoc(doc(db(BOB), "posts/postBob"), { text: "edited", editedAt: 1 })));
test("ALLOW author deletes own post", () => assertSucceeds(deleteDoc(doc(db(BOB), "posts/postBob"))));
test("ALLOW admin deletes any post", () => assertSucceeds(deleteDoc(doc(db(ADMIN), "posts/postBob"))));
test("ALLOW member votes in feed poll", () => assertSucceeds(updateDoc(doc(db(ALICE), "polls/poll1"), { "votes.0": ["alice"] })));
test("DENY member edits poll question", () => assertFails(updateDoc(doc(db(ALICE), "polls/poll1"), { question: "x" })));
test("DENY member creates poll", () => assertFails(addDoc(collection(db(ALICE), "polls"), { uid: "alice", question: "x" })));

// ── Chat ─────────────────────────────────────────────────
test("ALLOW member sends chat message", () => assertSucceeds(addDoc(collection(db(ALICE), "chat_messages"),
  { author: "Alice", authorEmail: "alice@x.com", uid: "alice", text: "hey", ts: 1, reactions: {}, replyCount: 0 })));
test("ALLOW member sends chat without authorEmail (new app)", () => assertSucceeds(addDoc(collection(db(ALICE), "chat_messages"),
  { author: "Alice", uid: "alice", text: "hey", ts: 1, reactions: {}, replyCount: 0 })));
test("ALLOW stale app sending own authorEmail", () => assertSucceeds(addDoc(collection(db(ALICE), "chat_messages"),
  { author: "Alice", authorEmail: "alice@x.com", uid: "alice", text: "hey", ts: 1, reactions: {}, replyCount: 0 })));
test("DENY member claims admin badge", () => assertFails(addDoc(collection(db(ALICE), "chat_messages"),
  { author: "Alice", uid: "alice", text: "hey", authorIsAdmin: true })));
test("DENY member spoofs admin email", () => assertFails(addDoc(collection(db(ALICE), "chat_messages"),
  { author: "Nate", uid: "alice", text: "hey", authorEmail: "nate@templetonimage.com" })));
test("ALLOW admin message with badge", () => assertSucceeds(addDoc(collection(db(ADMIN), "chat_messages"),
  { author: "Nate", uid: "adminUid", text: "hi", authorIsAdmin: true })));
test("ALLOW admin migration strips authorEmail", () => assertSucceeds(updateDoc(doc(db(ADMIN), "chat_messages/msgBob"), { authorEmail: deleteField(), authorIsAdmin: false })));
test("DENY member adds authorIsAdmin to own message", () => assertFails(updateDoc(doc(db(BOB), "chat_messages/msgBob"), { authorIsAdmin: true })));
test("ALLOW member reacts", () => assertSucceeds(updateDoc(doc(db(ALICE), "chat_messages/msgBob"), { "reactions.🔥": arrayUnion("alice") })));
test("ALLOW thread reply bumps parent replyCount", () => assertSucceeds(updateDoc(doc(db(ALICE), "chat_messages/msgBob"), { replyCount: increment(1) })));
test("ALLOW member votes in chat poll", () => assertSucceeds(updateDoc(doc(db(ALICE), "chat_messages/chatPoll"), { "votes.1": ["alice"] })));
test("DENY member edits another's chat text", () => assertFails(updateDoc(doc(db(ALICE), "chat_messages/msgBob"), { text: "x" })));
test("DENY member deletes another's chat message", () => assertFails(deleteDoc(doc(db(ALICE), "chat_messages/msgBob"))));
test("ALLOW author edits own chat", () => assertSucceeds(updateDoc(doc(db(BOB), "chat_messages/msgBob"), { text: "x", editedAt: 1 })));
test("ALLOW typing indicator own doc", () => assertSucceeds(setDoc(doc(db(ALICE), "chat_typing/alice"), { name: "Alice", ts: 1 }, { merge: true })));
test("ALLOW clear own typing doc", () => assertSucceeds(deleteDoc(doc(db(ALICE), "chat_typing/alice"))));
test("DENY typing doc for another uid", () => assertFails(setDoc(doc(db(ALICE), "chat_typing/bob"), { name: "x" })));

// ── Submissions / engagements / trackers ─────────────────
test("ALLOW member submits post proof", () => assertSucceeds(addDoc(collection(db(ALICE), "submissions"),
  { uid: "alice", memberName: "Alice", url: "https://instagram.com/p/n", pts: 10, round: "R4", weekIdx: 3, status: "ontime", ts: 1 })));
test("DENY submission as another member", () => assertFails(addDoc(collection(db(ALICE), "submissions"), { uid: "bob", pts: 10 })));
test("ALLOW member edits own submission", () => assertSucceeds(updateDoc(doc(db(ALICE), "submissions/subAlice"), { url: "https://instagram.com/p/a2", format: "reel", pts: 12, challengeApplied: true })));
test("DENY member marks own submission reviewed", () => assertFails(updateDoc(doc(db(ALICE), "submissions/subAlice"), { reviewed: true })));
test("DENY member edits another's submission", () => assertFails(updateDoc(doc(db(ALICE), "submissions/subBob"), { pts: 0 })));
test("ALLOW member deletes own submission", () => assertSucceeds(deleteDoc(doc(db(ALICE), "submissions/subAlice"))));
test("DENY member deletes another's submission", () => assertFails(deleteDoc(doc(db(ALICE), "submissions/subBob"))));
test("ALLOW admin marks submission reviewed", () => assertSucceeds(updateDoc(doc(db(ADMIN), "submissions/subBob"), { reviewed: true })));
test("ALLOW member reads all submissions (leaderboard)", () => assertSucceeds(getDocs(collection(db(ALICE), "submissions"))));
test("ALLOW member logs engagement", () => assertSucceeds(addDoc(collection(db(ALICE), "engagements"), { uid: "alice", memberName: "Alice", type: "comment", pts: 2, round: "R4", weekIdx: 3, ts: 1 })));
test("ALLOW member edits own engagement type", () => assertSucceeds(updateDoc(doc(db(ALICE), "engagements/engAlice"), { type: "share" })));
test("DENY member raises own engagement pts", () => assertFails(updateDoc(doc(db(ALICE), "engagements/engAlice"), { pts: 50 })));
test("ALLOW member deletes own engagement", () => assertSucceeds(deleteDoc(doc(db(ALICE), "engagements/engAlice"))));
test("ALLOW member updates own tracker (merge)", () => assertSucceeds(setDoc(doc(db(ALICE), "trackers/alice"), { name: "Alice", uid: "alice", tracked: { w3: [true] }, updatedAt: 1 }, { merge: true })));
test("ALLOW member creates own tracker", () => assertSucceeds(setDoc(doc(db(ALICE), "trackers/alice"), { name: "Alice", uid: "alice", tracked: {}, updatedAt: 1 }, { merge: true })));
test("DENY member changes own admin override", () => assertFails(updateDoc(doc(db(ALICE), "trackers/alice"), { "overrides.oct": 9 })));
test("DENY member writes another's tracker", () => assertFails(setDoc(doc(db(ALICE), "trackers/bob"), { tracked: {} }, { merge: true })));
test("ALLOW community points log own", () => assertSucceeds(addDoc(collection(db(ALICE), "smac_community_pts"), { uid: "alice", name: "Alice", action: "rsvp", pts: 2, ts: 1 })));
test("DENY community points log for another", () => assertFails(addDoc(collection(db(ALICE), "smac_community_pts"), { uid: "bob", pts: 99 })));

// ── Pro tools privacy ────────────────────────────────────
test("ALLOW member saves own plan", () => assertSucceeds(addDoc(collection(db(ALICE), "pro_plans"), { uid: "alice", plan: "p", createdAt: serverTimestamp() })));
test("ALLOW member lists own plans", () => assertSucceeds(getDocs(query(collection(db(BOB), "pro_plans"), where("uid", "==", "bob")))));
test("DENY member reads another's plan", () => assertFails(getDoc(doc(db(ALICE), "pro_plans/planBob"))));
test("DENY member lists all plans", () => assertFails(getDocs(collection(db(ALICE), "pro_plans"))));
test("ALLOW member saves own snapshot", () => assertSucceeds(setDoc(doc(db(ALICE), "analytics_snapshots/alice_R4_post"), { uid: "alice", data: 1 })));
test("ALLOW member gets own missing snapshot", () => assertSucceeds(getDoc(doc(db(ALICE), "analytics_snapshots/alice_R4_story"))));
test("ALLOW member lists own snapshots", () => assertSucceeds(getDocs(query(collection(db(BOB), "analytics_snapshots"), where("uid", "==", "bob")))));
test("DENY member reads another's snapshot", () => assertFails(getDoc(doc(db(ALICE), "analytics_snapshots/bob_R4_post"))));
test("DENY member writes snapshot under another's id", () => assertFails(setDoc(doc(db(ALICE), "analytics_snapshots/bob_R4_post"), { uid: "alice" })));

// ── Coworking ────────────────────────────────────────────
test("ALLOW member RSVPs own", () => assertSucceeds(setDoc(doc(db(ALICE), "smac_coworking_sessions/s1/rsvps/alice"), { uid: "alice", name: "Alice", rsvpAt: 1 })));
test("DENY RSVP for another", () => assertFails(setDoc(doc(db(ALICE), "smac_coworking_sessions/s1/rsvps/bob"), { uid: "bob" })));
test("DENY member awards attendance", () => assertFails(setDoc(doc(db(ALICE), "smac_coworking_sessions/s1/attendees/alice"), { uid: "alice" })));
test("DENY member creates session", () => assertFails(addDoc(collection(db(ALICE), "smac_coworking_sessions"), { label: "x" })));
test("ALLOW admin awards attendance", () => assertSucceeds(setDoc(doc(db(ADMIN), "smac_coworking_sessions/s1/attendees/alice"), { uid: "alice", awardedAt: 1 })));

// ── Reports ──────────────────────────────────────────────
test("ALLOW member files bug report", () => assertSucceeds(addDoc(collection(db(ALICE), "bug_reports"), { uid: "alice", message: "m", resolved: false, ts: 1 })));
test("DENY member reads bug reports", () => assertFails(getDocs(collection(db(ALICE), "bug_reports"))));
test("ALLOW member logs platform error", () => assertSucceeds(addDoc(collection(db(ALICE), "platform_errors"), { context: "x", message: "y", timestamp: 1 })));
test("DENY member reads corrections", () => assertFails(getDoc(doc(db(ALICE), "corrections/c1"))));
