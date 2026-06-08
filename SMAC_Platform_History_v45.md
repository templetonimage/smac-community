# SMAC Platform — Full Project History & Context

_Last updated: June 7, 2026 — v45_

---

## Session Log

### June 7, 2026 — Engagement Submission Upload Fix + Round Field + Admin Viewer Round-Scoping

#### Problems

**1. Engagement screenshot upload silently freezing**
Members reported "it keeps getting stuck when I upload the picture." No error was shown. Root cause: `handleEngScreenshot` had no file size gate and the `catch` block only did `console.error` — if `compressImage` failed or stalled on a large file (modern phone screenshots can be 4–6MB), the label never updated and `engScreenshotBase64` stayed null. User saw no feedback.

**Fix:**
- Added 10MB size gate before compression — shows error in `eng-error` div immediately if exceeded
- Added `"Compressing…"` label state so the user knows processing is happening
- `catch` block now resets label and shows a user-facing error message instead of silently failing

**2. No `round` field on engagement docs — impossible to filter by round in Firestore**
R2 and R3 engagements both use `weekIdx` 0–11, making them indistinguishable in the console or in queries without a timestamp calculation. `getWeeklyEngCount` was also not round-scoped, meaning R2 engagement history could theoretically count against R3 weekly caps.

**Fix:**
- `submitEngagement` now stamps `round: window.CURRENT_ROUND || "R3"` on every new engagement doc
- `getWeeklyEngCount` now includes `where("round","==", CURRENT_ROUND)` so weekly cap checks are round-scoped
- Backfill script (`backfill_round_r3.js`) written and executed — stamped `round: "R3"` on all `engagements` and `submissions` docs with `ts >= 1780286400000` (Jun 1 2026 04:00 UTC = Jun 1 00:00 ET). Docs without a `round` field and below that threshold are implicitly R2.
- Note: `submissions` already had `round` field from prior work; backfill filled any gaps.

**3. Admin Engagement Posts viewer showing R2 week labels and loading all rounds**
The week filter dropdown and modal week dropdown were hardcoded with R2 date strings (Mar–May). `loadEngViewer` fetched all engagements with no round filter. `WEEK_LABELS` inside `renderEngViewer` was also a hardcoded R2 array.

**Fix:**
- Both week `<select>` elements emptied of hardcoded options
- `loadEngViewer` now populates both dropdowns dynamically from the live `WEEKS` config (auto-updates each round)
- `loadEngViewer` query now includes `where("round","==", CURRENT_ROUND)` — only current round engagements load
- `WEEK_LABELS` in `renderEngViewer` now derived as `WEEKS.map(w => \`${w.month} ${w.label} · ${w.dates}\`)` — no hardcoding

#### Manual Correction This Session
- June 7 engagement docs with `weekIdx: 1` (miscategorized by the earlier week boundary fix) manually corrected to `weekIdx: 0` in Firestore console

#### Key Learnings
- `ts` in engagement/submission docs is stored as a plain JS number (ms), not a Firestore Timestamp object. Firestore console filter UI defaults to Timestamp type and will not match. Use Query Builder with numeric type or sort by `ts` descending to isolate recent docs.
- Always stamp `round` on any collection that accumulates data across multiple rounds. `weekIdx` alone is never sufficient as a round discriminator.
- Backfill timestamp boundary: R3 start = `1780286400000` (Jun 1 2026 04:00 UTC). R2 end = `1780286399999`. No overlap possible.
- Admin dropdowns and labels referencing week dates must derive from the live `WEEKS` config, not hardcoded strings, or they break on every round transition.

---

### June 7, 2026 — R3 (and R4) Week Boundary Off-by-One Fix

#### Problem

Week 1 (Jun 1–7) was displaying as Week 2 on June 7, and the Weekly Challenge Modifier was also showing the Week 2 challenge. Members who submitted on June 7 were bucketed into Week 2 instead of Week 1.

**Root cause:** The R3 `ROUND_CONFIGS` weeks array used the same UTC timestamp as both the end of one week and the start of the next. For example:

- W1: `[Jun 1 04:00 UTC, Jun 7 03:59:59 UTC]` — ends at the start of Jun 7 ET
- W2: `[Jun 7 04:00 UTC, Jun 14 03:59:59 UTC]` — starts at the start of Jun 7 ET

`Date.now()` on June 7 at any point after midnight ET matched the W2 start, not W1's end. W1 was effectively only 6 days long. The same pattern repeated on W5/W6 (Jul 7) and W9/W10 (Aug 7), and identically in R4 on Sep 7, Oct 7, and Nov 7.

#### Fix

Shifted all "transition day" week boundaries so each week ends at the end of its stated last day, and the next week starts the following day.

R3: W1/W2 Jun 1–7 / Jun 8–14; W5/W6 Jul 1–7 / Jul 8–14; W9/W10 Aug 1–7 / Aug 8–14.
R4: W1/W2 Sep 1–7 / Sep 8–14; W5/W6 Oct 1–7 / Oct 8–14; W9/W10 Nov 1–7 / Nov 8–14.

Also corrected: end timestamps for W1/W4/W8/W12 in both rounds (were ending a day early); `Date.UTC(2026,6,31,...)` for "Jul 31" corrected to `Date.UTC(2026,7,1,3,59,59,999)`; all `weekDefs` date label strings updated to match (e.g. `"Jun 7–14"` → `"Jun 8–14"`).

#### Key Learning

- The correct `ROUND_CONFIGS` week boundary pattern: week N ends at `(startDay + 7) 03:59:59 UTC`, week N+1 starts at `(startDay + 7) 04:00:00 UTC`. Never the same day for both sides.
- "7 days from Jun 1" = Jun 8 start, not Jun 7. Each week spans exactly 7 calendar days inclusive.

---

### June 2, 2026 — Feed Post Delete: Points Reversal + R2 Wipe Points Deduction

---

#### Problem 1 — Deleting a Feed Post Did Not Remove Points

Deleting a feed post via the 🗑 button removed the card from the Feed but left the `+2` community points on the member's total.

**Root cause:** `deleteFeedPost` used `WEEK_SCHEDULE.findIndex()` to determine which week the post belonged to, then only deducted points if `weekIdx >= 0`. Since `WEEK_SCHEDULE` reflects the active round (R3, June–August), R2 posts returned `weekIdx = -1` and the deduction block was silently skipped.

**Fix:** Removed the week lookup entirely. A post earns `PTS_POST` at creation — on delete, always deduct it unconditionally, regardless of which round or week the post came from. Registry lookup uses `currentUser.registryId` for own posts; falls back to a `uid` query for admin-deleting another member's post.

---

#### Problem 2 — R2 Bulk Wipe Did Not Deduct Points

`clearR2FeedPosts` deleted all R2 post documents but performed no points adjustment. Any community points earned from R2 feed posts remained on member totals.

**Fix:** Before deleting, the function now tallies posts per uid per R2 week (using `ROUND_CONFIGS.R2.weeks` for exact bounds). Applies the `FEED_POSTS_PER_WEEK` cap (`Math.min(count, 2) * PTS_POST`) to compute exact points earned per member. After deletion, queries each affected member's registry doc by `uid` and applies `increment(-pts)`. Status message reports both deleted post count and adjusted member count.

**Note:** The first R2 wipe (run before this fix) left stale points on affected members. Those need to be manually corrected via the admin Community Points backfill tool or a direct Firestore edit.

---

#### Key Learnings

- **`WEEK_SCHEDULE` is always the active round.** Any logic that uses `WEEK_SCHEDULE` to look up past-round data will return `-1` / null. Past-round timestamp lookups must use `ROUND_CONFIGS[roundKey].weeks` directly.
- **Points deductions on delete should not depend on week context.** If a post earned points at creation, those points should always be reversed on delete. The week/cap check is only relevant at creation time to decide whether points are earned at all.
- **Bulk deletes need matching points adjustments.** Any admin tool that wipes a set of documents that awarded points must also compute and reverse those points as part of the same operation.

---

### June 2, 2026 — Community Points: Feed Post Awards, Like/Props +1pt, Grace Token Redesign, R2 Archive Sweep, Admin Auth Fix

---

#### Problem Set (6 items)

1. Feed posts were not awarding points — `submitPost` wrote an audit log entry but never incremented the registry.
2. No points existed for liking, giving Props, or replying to feed posts.
3. "How Points Work" was out of date.
4. No way to archive all R2 feed posts in one sweep.
5. Grace Tokens needed a redesign: award +10 pts (instead of 0), and use a variable monthly limit (2/3/4 by month) instead of a flat 2.
6. Admin account was being signed out on every Chrome refresh — had to re-login each time.

---

#### Fix 1 — Feed Post Points (Bug + Limit)

**Root cause:** `submitPost` called `logCommunityPts()` (audit log only) but never wrote `updateDoc({points: increment(PTS_POST)})` to the registry doc. No points were actually awarded.

**Changes:**
- `PTS_POST` constant updated from `1` to `2`.
- `submitPost` now performs a weekly post count query (`posts` collection, filtered by `uid` + current week's timestamp range) before awarding points.
- Points only awarded if `feedPostsThisWeek <= FEED_POSTS_PER_WEEK` (cap: 2).
- Toast message confirms pts earned (`+2 pts 🎉`) or notifies when the weekly cap is hit.
- New constants added: `FEED_POSTS_PER_WEEK = 2`, `MAX_FEED_INT_PER_WEEK = 5`.
- New helper: `currentWeekIdx()` — returns the current week index from `WEEK_SCHEDULE` (safe, returns 0 if outside schedule). Used by `submitPost`, `toggleLike`, and `confirmProps`.

---

#### Fix 2 — Like / Props +1pt (5-Interaction/Week Cap)

New constant: `PTS_LIKE_PROPS = 1`.

**`toggleLike`:** On like (not unlike), queries `smac_community_pts` for the current user's `Feed Like`, `Feed Props`, and `Feed Reply` actions this week. Awards `PTS_LIKE_PROPS` and logs `"Feed Like"` only if `intActions.length < MAX_FEED_INT_PER_WEEK`.

**`confirmProps`:** Same interaction-count check. Awards `PTS_LIKE_PROPS` and logs `"Feed Props"` if under cap.

**Reply points:** When a reply UI is built, wire it to log `"Feed Reply"` — the cap check already includes it.

**Weekly cap logic:** Reads `smac_community_pts` (the audit log collection) filtered by `uid` + week timestamp range and counts only the three qualifying action types. No new Firestore collection needed.

---

#### Fix 3 — "How Points Work" Updated

Community Points section in the Leaderboard page now reads:

- `✍️ Community feed post: +2 pts · max 2/week`
- `♥ Like, give Props, or reply on a feed post: +1 pt · max 5/week`
- `🤝 Coworking RSVP: +2 pts`
- `🏢 Coworking attendance: +5 pts`
- `🛡️ Grace Token (Pro): +10 pts · covers a missed post (no modifiers)`

---

#### Fix 4 — R2 Archive Sweep (Admin Tool)

New "R2 Archive Sweep" card added at the top of the `admin-clear-feed-tool` section, above the existing per-week selector.

**New function: `window.archiveR2FeedPosts()`**
- Requires admin + double-confirm.
- Queries all `posts` docs with `ts < 2026-06-01T00:00:00Z` (R2_CUTOFF).
- Deletes in a sequential loop with a live progress counter in the status element.
- Calls `loadFeed()` on completion.
- Tracker submissions, engagement records, and points are NOT affected (feed-only delete, consistent with per-week tool).

The existing per-week selector and `clearFeedPostsByWeek()` function are unchanged.

---

#### Fix 5 — Grace Tokens Redesign

**Old behavior:** Flat `GRACE_TOKENS_PER_MONTH = 2` constant. Grace submission wrote `pts: 0` — no points awarded. Protect streak only.

**New behavior:**
- Variable monthly limit: Month 1 = 2 tokens, Month 2 = 3 tokens, Month 3 = 4 tokens.
- Using a token awards `GRACE_PTS = 10` pts (no modifiers).

**Removed:** `GRACE_TOKENS_PER_MONTH` constant (fully replaced).

**New constants/helpers:**
- `const GRACE_PTS = 10`
- `graceTokensForMonth(monthKey)` — looks up `monthKey` ("YYYY-MM") against `window.MONTHS` start/end timestamps; returns 2/3/4 based on program month index (0/1/2). Falls back to 2 if outside schedule.
- `graceTokensThisMonth()` — convenience wrapper calling `graceTokensForMonth(currentMonthKey())`.

**Updated surfaces (all `GRACE_TOKENS_PER_MONTH` references replaced):**
- `getGraceState()` — uses `graceTokensForMonth(mk)` as the reset allowance.
- `spendGraceToken()` — grace submission now `pts: GRACE_PTS`; adds `points: _inc(GRACE_PTS)` to the `updateDoc` call; toast updated to show `+10 pts awarded`.
- `useGraceToken` confirm dialog — updated to reflect `+10 pts`.
- Grace card render — `monthAllowance` variable derived from `graceTokensThisMonth()`; pip row and `X / Y` display use `monthAllowance`; card description updated.
- `refundGraceToken()` — `Math.min(GRACE_TOKENS_PER_MONTH, ...)` → `Math.min(graceTokensThisMonth(), ...)` in both refund paths (auto-refund and admin delete cleanup).
- Admin All-Star Reports table — grace column denominator uses `graceTokensThisMonth()`.

**Design note:** `graceTokensForMonth` accepts a `monthKey` arg (not always "now") so it works correctly for past-month evaluations if ever needed. The function depends on `window.MONTHS` being initialized, so it must be called after `_resolveActiveRound()` runs.

---

#### Fix 6 — Admin Auth Persistence

**Root cause:** `onAuthStateChanged` validates a restored session by checking `Array.isArray(saved.rounds)`. The admin `currentUser` object was `{name, email, isAdmin, uid}` — no `rounds` field. This caused `sessionValid` to be `false` on every refresh, clearing localStorage and requiring re-login.

**Fix:** Admin `currentUser` now includes `rounds: []`:
```js
currentUser = { name:"Nate Templeton", email, isAdmin:true, uid:firebaseUid, rounds:[] };
```
`rounds: []` satisfies `Array.isArray(saved.rounds) === true`. Admin session now persists across refreshes correctly.

---

#### Key Learnings

- **`logCommunityPts` is an audit log, not a points write.** It creates a record in `smac_community_pts` but never touches the registry `points` field. Any feature awarding community points must also call `updateDoc(registry, {points: increment(N)})` separately.
- **Session validity checks gate all new `currentUser` fields.** If a new required field is added to the session validator, every path that creates `currentUser` (login, onAuthStateChanged restore, admin path) must include it or risk spurious sign-outs. Admin path is a separate code branch from the member registry path — easy to miss.
- **`GRACE_TOKENS_PER_MONTH` as a flat constant breaks once limits vary by month.** Always prefer a function that accepts a month key so the allowance is computed from the program schedule, not hardcoded.
- **Feed post weekly cap requires a Firestore query, not a local counter.** Local state can drift (page reload, multiple devices). Querying `posts` by `uid + week timestamp range` is the only reliable source of truth for the cap check.

---

### June 2, 2026 — Prior-Round Member Login Gate

Allowed members from previous rounds (e.g. R2-only) to log into the platform without enrolling in the current round, while restricting access to all non-dashboard pages until they renew.

---

#### Problem

The `handleLogin` `!enrolled` block signed out any member not enrolled in `CURRENT_ROUND` and showed "You're not enrolled in Round 3 yet. Contact Nate." This blocked R2 members from seeing the renewal modal and renewal card — the exact surfaces designed to convert them.

---

#### Fix 1 — `handleLogin`: Let Prior-Round Members Through

The `!enrolled` block now checks `hasPriorRound` (i.e. `member.rounds.length > 0`):

- **Prior-round member (R2-only):** falls through to `bootApp()`. No error shown, no sign-out. The renewal modal fires automatically via the existing `maybeShowRenewModal()` logic (R2-only path already unconditionally pops it).
- **Truly unknown account (no rounds at all):** still gets the error message + `signOut`.

---

#### Fix 2 — `navTo`: Page Gate for Unenrolled Members

Two additions before the existing `navTo` body:

**`isUnenrolledMember()` helper**
```js
function isUnenrolledMember(){
  if(!currentUser||currentUser.isAdmin||currentUser.isFounder) return false;
  return !(currentUser.rounds||[]).includes(window.CURRENT_ROUND||"R3");
}
```
Returns true for any member with prior rounds who is not enrolled in the current round. Admins and founders always pass.

**`_GATED_PAGES` Set**
```js
const _GATED_PAGES = new Set(["feed","submit","leaderboard","tracker","resources","pro","reports","directory"]);
```

**Gate intercept** — at the top of `navTo`, if `isUnenrolledMember()` and the target page is in `_GATED_PAGES`:
- Clears all active pages/nav items
- Replaces the target page's innerHTML with a lock screen: 🔒 heading, "Round X Access Required" copy, and a "Renew for Round X →" button that calls `openRenewModal()`
- Round number is dynamic from `window.CURRENT_ROUND`
- Returns early (skips all data-loading calls)

**Accessible pages for unenrolled members:** Dashboard and Profile only.

---

#### Round-Future-Proof Design

`isUnenrolledMember()` and `_GATED_PAGES` use `window.CURRENT_ROUND` throughout. When `_resolveActiveRound()` flips to R4 (or any future round), R3-only members automatically receive the same gate with no code changes required. The lock screen copy and renewal modal button dynamically reflect the active round number.

---

#### Key Learnings

- **Never sign out a paying member at the login gate.** Prior-round members have a paid relationship with the platform. Blocking login prevents conversion; letting them in and gating pages creates a clear upgrade path.
- **`hasPriorRound` is the right signal, not `enrolled`.** A member with any `rounds` entry is a known, paid member. A member with an empty `rounds` array is a data anomaly.
- **Gate at `navTo`, not at the page load functions.** Intercepting navigation is cleaner than guarding each individual load function, and ensures the gate fires regardless of how a page is reached.

---

### June 2, 2026 — R3 Launch Day Fixes: Round-Scoping, Modal Logic, Speed, UX Polish

This session addressed a cascade of R2→R3 data bleeding issues discovered on launch day, plus leaderboard performance, modal routing fixes, and several UX improvements.

---

#### Core Bug: R2 Data Bleeding into R3 Submissions

**Root cause:** Submissions from R2 used `weekIdx` values 0–11, identical to R3's `weekIdx` values. Queries filtering only by `uid + weekIdx` (no round field) treated R2 Week 1 and R3 Week 1 as the same week.

**Affected surfaces fixed:**

- **Weekly submission limit check** (`submitIgPost`) — `weekCountSnap` query adds `where("round","==",CURRENT_ROUND)`. R2's posts at `weekIdx=0` no longer block R3 Week 1 submissions.
- **Duplicate URL check** (`submitIgPost`) — same `round` filter added.
- **Tracker backfill** (`buildTracker`) — backfill query now filters by `round`. R2 submissions no longer auto-check R3 tracker boxes.
- **`loadMySubmissions`** — query filters by `round`. R2 submissions no longer appear in "My Submissions." Fallback: if composite index isn't ready, catch block re-fetches without round filter and applies timestamp-range filter client-side. Local fallback path also applies timestamp bounds.
- **`loadMyEngLog`** — Firestore fetch result filtered client-side by `_eRoundStart`/`_eRoundEnd` timestamp range. Local fallback path also applies timestamp filter.
- **Dashboard** (`loadDashboard`) — submissions query uses `where("round","==",CURRENT_ROUND)`. Engagements filtered by timestamp range. `postPts`, `engPts`, `communityPts`, `totalPts`, and `submissionCount` all R3-scoped. `communityPts` formula uses round-scoped engs (not all-time) for consistency.
- **All-Star Reports** (`loadTrackerReport`) — now fetches R3 submissions directly (`where("round","==",CURRENT_ROUND)`), builds `subsByUid` map per `weekIdx`, and **reconstructs `tracked` from submissions** rather than reading the tracker doc's `tracked` field. Tracker docs are keyed `w1–w12` across all rounds with no round isolation — reading them directly showed R2 progress. Tracker doc still used for metadata (name, overrides, graceTokens); `tracked` rebuilt from R3 submission counts.

**Composite Firestore indexes required:**
- `submissions`: `uid asc + weekIdx asc + round asc` (submission limit/dup checks)
- `submissions`: `uid asc + round asc + ts desc` (`loadMySubmissions`)
- Both created by Nate via browser console link on first query.

---

#### Leaderboard & Dashboard Speed: Round-Filtered Submission Queries

**Problem:** `loadLeaderboard`, `loadDashboard` (cache-fill block), and the pre-warm `setTimeout` all called `getDocs(col(db,"submissions"))` — a full collection scan downloading all R2 and R3 docs (~1,800+ total). This was the primary cause of slow leaderboard loads on member accounts.

**Fix:** All three locations replaced with `getDocs(q(col(db,"submissions"), where("round","==",CURRENT_ROUND)))`. R2 docs never had a `round` field, so they don't match. Only R3 docs fetched. Single-field equality query uses Firestore's automatic indexes — no composite index needed. `where` added to the `loadLeaderboard` import.

**90-second in-memory cache** (`window._lbSubCache`): shared between `loadLeaderboard`, `loadDashboard` cache-fill, and pre-warm. First load warms it; subsequent opens within 90s skip the Firestore read. Cache busts after any new submission or engagement.

**Pre-warm on login boot:** `setTimeout(..., 4000)` fires the R3-filtered submissions query silently 4 seconds after login, before the member navigates anywhere. Cache is warm by the time they open the leaderboard.

---

#### `isRoundOver()` / Round-Ended Banner

**Problem:** `ROUND_END_TS` was hardcoded to R2's end date (`Date.UTC(2026,5,1...)`), causing `isRoundOver()` to return `true` during all of R3. This disabled the Submit button and showed the "Round 2 Has Ended" banner for all R3 members.

**Fix:** Removed `ROUND_END_TS` constant. `isRoundOver()` now reads `WEEK_SCHEDULE[WEEK_SCHEDULE.length-1][1]` dynamically — checks the active round's final week end. Auto-correct for R4+ with no code changes needed.

**Banner title** (`#round-ended-title`) set dynamically: `"R3 Has Ended"` instead of hardcoded "Round 2 Has Ended".

---

#### Welcome Modal & Renewal Modal Logic

**`showWelcomeModal` changes:**
- Skips entirely for non-R3 members (they get the renewal modal instead).
- Sets heading dynamically: `"Welcome to Round ${rNum}! 👋"` using `CURRENT_ROUND`.
- HTML heading given `id="welcome-modal-heading"`.

**`maybeShowRenewModal` changes:**
- R3 members (founders or `rounds.includes(CURRENT_ROUND)`) → skipped entirely.
- R2-only members → always shows (dismiss key bypassed) so they always see the updated June 6 deadline.
- Others → respect dismiss key as before.

**Post-login `setTimeout` guard (900ms):**
- Added `isR3Enrolled` check before calling `maybeShowRenewModal`. Founders and R3 members return early before the function is even called — prevents the modal from showing when the welcome modal was already dismissed from R2 (stale `smac_welcomed_<uid>` localStorage key).

**Stale session fix:**
- `onAuthStateChanged` session restore now requires `Array.isArray(saved.rounds)` as a validity condition. R2-era sessions (missing `rounds` field) are treated as stale, clearing localStorage and requiring one fresh re-login. After re-login, `currentUser` is saved with the `rounds` array and session restores correctly.
- `currentUser` assignment now includes `rounds: Array.isArray(member.rounds) ? member.rounds : []`.

**Renewal modal updates:**
- Heading: `"Round 3 Starts June 1"` → `"Registration Extended to June 6"` with updated subtext.
- Countdown date display: `"May 31, 2026 · 11:59 PM ET"` → `"June 6, 2026 · 11:59 PM ET"`.
- `RENEW_DEADLINE_TS`: `2026-06-01T03:59:00Z` → `2026-06-07T03:59:00Z`.

---

#### Dashboard Card Cleanup

- **`dash-renew-card`**: `display:none` by default in HTML. `loadDashboard` shows it only for non-R3 members. Heading updated to "Registration Extended to June 6."
- **`dash-feedback-card`** (Round 2 feedback): `id="dash-feedback-card"` added, `display:none`, always hidden in `loadDashboard`. R2 is over.
- **"Live · Round 2" label** in Top 10 Standings → dynamic via `id="dash-lb-round-label"`: `"Live · Round ${rNum}"`.
- **Pro dashboard cache key** scoped to round: `smac_pro_dash_${uid}_${CURRENT_ROUND}`. R2 cached data no longer served into R3 session.

---

#### Dashboard Points Scoping

Previously `totalPts = regData.points` (lifetime registry total). Now:
- `submissions` query: `where("round","==",CURRENT_ROUND)` — R3 posts only.
- `engagements`: timestamp-filtered to `_roundStart`/`_roundEnd`.
- `postPts`, `engPts`, `communityPts`, `totalPts`, `submissionCount` all scoped to R3.

---

#### Dashboard Card Layout Changes

- **Weekly Challenge Modifier card** (`dash-challenge-banner`) moved above `dash-stats-grid` (was below the All-Star banner).
- **"Next Week" modifier subtext** (`dash-next-challenge`) moved directly below `dash-challenge-banner` (both now above stats grid).

---

#### Profile Page Fixes

- **Renewal card** (`#profile-renew-card`): `display:none` by default. `loadProfile` shows it only for non-R3 members. Consistent with dashboard card behavior.
- **Password visibility toggle**: Both `new-password` and `confirm-password` inputs wrapped in `position:relative` div. Eye button (`👁`/`🙈`) positioned absolutely to the right. `window.togglePwVis(inputId, btnId)` helper added — toggles `input.type` between `"password"` and `"text"` and swaps icon.

---

#### Round Label Fixes (Hardcoded "Round 2" Sweep)

All reachable hardcoded "Round 2" strings replaced with dynamic `CURRENT_ROUND`-based values:

- **Analytics Snapshot modal heading** (`#snap-modal-heading`): static `"Your Round 2 Growth"` → dynamic in `openSnapModal`: `"Your Round ${rNum} Growth"` or `"Set Your Round ${rNum} Baseline"` depending on type.
- **Analytics Snapshot modal subtext** (`#snap-modal-sub`): default updated to reference Round 3; also set dynamically in `openSnapModal`.
- **Tracker page heading**: `"Round 2 Progress"` → `id="tracker-round-heading"`, set dynamically in `buildTracker()`.
- **Directory subtitle**: `"Your Round 2 crew"` → `id="directory-round-sub"`, set dynamically in `buildTracker()`.
- **Profile round badge**: `"Round 2 · 2026"` → `` `Round ${rNum} · ${new Date().getFullYear()}` `` rendered dynamically in `renderProfileHero`.
- **All-Star track description**: already used `MONTHS[]` for month names; static fallback text simplified.

Unreachable "Round 2" strings intentionally left: `dash-feedback-card` content (`display:none`); `getSnapshotWindow()` R2 end-window config (gated by `round === "R2"`, permanently false).

---

#### Topnav Spacing

`.topnav-user` CSS: added `margin-left: 8px` so the username text has breathing room from the SMAC wordmark.

---

#### Key Learnings

- **Tracker docs are not round-safe.** Week IDs `w1–w12` repeat across every round. Any feature reading tracker docs for current-round progress must either rebuild from submissions filtered by round (current approach for All-Star Reports) or scope tracker docs per round (not yet done).
- **`onAuthStateChanged` session restore bypasses all field additions.** Any new field added to `currentUser` during login will be absent for users who restore from `smac_session` localStorage. Solution: add that field as a session validity requirement.
- **Full collection scans are expensive at scale.** `getDocs(col(db,"submissions"))` fetches all rounds' data. At 50 members × 12 weeks × 3 posts = 1,800+ docs per round by end of R3. Always filter by `round` field for per-round aggregations. R2 docs lack the `round` field and are automatically excluded by `where("round","==","R3")`.
- **R3→R4 transition checklist additions:** Run `arrayUnion("R4")` on returning members' registry docs before `CURRENT_ROUND` flips. Clear or scope stale `smac_session` localStorage. Update `RENEW_DEADLINE_TS` and renewal modal copy (or verify dynamic `isRoundOver()` is still in place).


---

### June 2, 2026 — Leaderboard: Round-Scoped Submission Counts

#### Problem
Both leaderboard surfaces (Rankings page + Dashboard mini-leaderboard) were displaying stale R2 data after the R3 launch. Two separate bugs:

1. **Wrong source (prior fix attempt):** `m.totalPosts` on the registry doc is a cumulative lifetime counter, never reset at round boundaries. Using it showed the full R2+R3 combined count.
2. **Wrong source (original code):** Before the fix attempt, both surfaces used `_trackerCache` tracker checkbox data — also round-unaware and stale from R2.

#### Fix — Bulk Submission Query + uid->Count Map

Both surfaces now fetch the entire `submissions` collection once per load, filter client-side by the active round's timestamp window (`WEEK_SCHEDULE[0][0]` to `WEEK_SCHEDULE[last][1]`), and build a `uid -> count` map. Grace submissions (`status === "grace"`) excluded. Each row looks up its own count from the map.

**`loadLeaderboard`:**
- `_lbSubCounts` declared (hoisted above `try` for clean scoping), built after member fetch
- `_subCounts = _lbSubCounts` passed into `.map()` render
- Per-member: `submissions = _subCounts[mUid] ?? 0`

**`loadDashboard` + `_renderDashboard`:**
- `_dashSubCounts` built after `lbMembers` is assembled, before `_renderDashboard` call
- Passed as new `lbSubCounts` param in `_renderDashboard` destructured signature
- Mini-leaderboard render: `submissions = (lbSubCounts||{})[_mUid] ?? 0`
- Two fallback `_renderDashboard` call sites (offline/error paths) unaffected — they pass `leaderboard:[]` so mini-leaderboard doesn't render

**Why one bulk read works:** A full collection read + client-side timestamp filter reuses the same pattern as `getRoundSubmissionCount()` and requires no composite index.

#### Label Change
Both surfaces updated from `"X posts"` to `"X submission(s) made"` (singular/plural aware).

#### Key Learning
`m.totalPosts` on `smac_registry` is a lifetime cumulative counter incremented on every `submissions` write and decremented on admin delete. It is NOT round-scoped and should not be used for per-round display. For round-scoped counts, always query `submissions` with a timestamp range derived from `WEEK_SCHEDULE`.

---

### June 2, 2026 — Archive Round: Round Selector + ROUND_CONFIGS Window Exposure

#### Problem
The Archive Round tool read `window.CURRENT_ROUND` to determine which round to archive. At the R2→R3 transition (June 1), `_resolveActiveRound()` had already flipped `CURRENT_ROUND` to `"R3"`, so the tool showed "Archive Round 3" with R2's points — wrong round, correct data. Running it would have stamped `round: "R3"` on all members' `roundHistory` with their R2 points.

#### Fix 1 — Round Selector Dropdown (HTML)
Added a "Round to Archive" label + `<select id="archive-round-select">` above the Preview button inside `#archive-round-tool`. Populated dynamically from `ROUND_CONFIGS` keys on admin login.

#### Fix 2 — `window.ROUND_CONFIGS` Exposure
`ROUND_CONFIGS` was a module-scoped `const` not accessible outside the `type="module"` script block. Changed declaration to:
```js
const ROUND_CONFIGS = window.ROUND_CONFIGS = {
```
This allows `initArchiveRoundSelect()` (a non-module function) to read it.

#### New Functions
- **`initArchiveRoundSelect()`** — populates the dropdown from `Object.keys(window.ROUND_CONFIGS)`, pre-selects `window.CURRENT_ROUND`. Called once when admin logs in (alongside other admin tool reveals).
- **`window.onArchiveRoundSelectChange()`** — fires on dropdown change; clears preview/run/status areas, resets `_archiveRoundTarget`, updates button label spans.

#### Updated Function — `previewArchiveRound()`
- Now reads `sel.value` from `#archive-round-select` instead of `window.CURRENT_ROUND`
- Falls back to `window.CURRENT_ROUND` only if selector has no value (empty string)
- Empty-selection error message changed from `"CURRENT_ROUND is not set"` to `"Select a round above before previewing."`

#### `runArchiveRound()` — No Changes
Already reads from `_archiveRoundTarget.round` (set by `previewArchiveRound`), so it correctly uses whatever round was previewed. Double-run guard unchanged.

#### Key Learning
At every round transition, the Archive tool will default to the new active round. Admin must manually select the just-ended round before previewing. This is correct behavior — the selector makes it explicit rather than silently archiving the wrong round.

---

### June 1, 2026 — Submission-Driven Tracker Sync

Replaced manual checkbox-only tracker with a system where real post submissions automatically fill tracker slots. Manual checking remains available as a fallback.

#### Core Design

- Submissions are the authoritative source for tracker slot state
- Tracker doc (`trackers/{uid}`) remains the read target for all downstream consumers (All-Star eval, Admin Tracker Report, dashboard dots, leaderboard) — no changes to those surfaces
- Slots fill from index 0 up to `realCount`; manual checks above that count are preserved
- Grace submissions (`status === "grace"`) excluded from slot count
- Pro member slot counts use `weekRequirementFor(weekIdx, true)` (3/4/5 targets)

#### New Helper: `syncTrackerFromSubmission(weekIdx, uid, realCount)`

- Derives `weekId = WEEKS[weekIdx].id`
- Reads current `tracked[weekId]` to preserve manual checks beyond submission count
- Builds slot array: `slots[i] = i < realCount ? true : (existing[i] === true)`
- Writes via `setDoc(..., { tracked: { [weekId]: slots } }, { merge: true })`
- Updates `_trackerCache[uid]` and localStorage `smac_tracker_${uid}`
- Defined immediately before `window.toggleCheck`

#### `submitPost` — sync on save

- After successful `addDoc` + points update + `refundGraceToken`, calls `syncTrackerFromSubmission(weekIdx, currentUser.uid, realPostCount + 1)`
- Reuses `realPostCount` already in scope from the weekly limit check — no extra Firestore read

#### `deleteMemberSubmission` — sync on delete

- Function signature updated: `async function(subId, pts, weekIdx)`
- Call site in `loadMySubmissions` render HTML updated to pass `${s.weekIdx??-1}` as third arg
- Firebase branch: after `deleteDoc`, re-queries remaining real subs for that `uid + weekIdx`, then calls `syncTrackerFromSubmission` with the remaining count
- Local fallback branch: filters `lsGet("smac_submissions")` for remaining real subs, calls sync

#### `buildTracker()` — lazy backfill

- On first session visit (`window._trackerBackfillDone` flag), queries all member submissions
- For each week where `realCount > trackerSlotCount`, calls `syncTrackerFromSubmission` silently
- Calls `buildTracker()` again after backfill completes to re-render with corrected state
- Self-heals existing R3 members on first Tracker page visit — no admin script needed

#### Subtitle Copy Updated (line 977)

- Old: `"Log your weekly posts — check off after you've posted, not before"`
- New: `"Your tracker updates automatically when you submit a post. Tap any unchecked box to mark it manually."`

#### What Did NOT Change

`toggleCheck`, `evaluateAllStar`, Admin Tracker Report, dashboard dots, leaderboard, Grace Token logic.

---

### June 1, 2026 — Post-Launch Cleanup: Label + Data Source Fixes

---

#### Dashboard — "Posts Made" -> "Submissions Made"

- `dash-stat-label` changed from "Posts Made" to "Submissions Made"
- `dash-val-count` count-up now uses `submissionCount` (`subs.length` from the already-fetched `submissions` Firestore query filtered by `uid`) instead of `trackerPostCount` (tracker checkbox tally)
- `_renderDashboard()` signature updated to include `submissionCount`; all 3 call sites updated (success path, `useLocalFallback` path, catch block)
- Fallback: `submissionCount ?? trackerPostCount` for offline/local mode

**Source distinction:** `subs.length` = actual post submissions to Firestore. `trackerPostCount` = manually checked tracker boxes. These can drift; `subs.length` is authoritative.

---

#### Leaderboard — "xx posts" -> "xx post submission(s)"

Two locations updated: full Ranking page (`loadLeaderboard`) and Dashboard mini-leaderboard (`_renderDashboard`).

- Removed `_trackerCache` lookup and `trackerPosts` calculation from both render paths (was reading tracker checkbox state, not submission data)
- Now uses `m.totalPosts` from the registry doc directly
- Label: `"${posts} post${posts!==1?'s':''}"` -> `"${submissionCount} post submission${submissionCount!==1?'s':''}"`

**Why `m.totalPosts` is correct:** Incremented `+1` on every `addDoc` to `submissions`; decremented `-1` on admin delete. Never touched by engagement submissions or tracker checkboxes. No extra Firestore read needed.

---

#### "How Points Work" Card — Backlink Line Removed

- Removed "Backlink directory listing: +15 pts" from the Rankings page How Points Work card
- No backlink directory exists in SMAC; the line was misleading to members
- `PTS_BACKLINK` constant and all admin/submit/points-map references retained for future use

---

### June 1, 2026 — R3 Launch Day: Community Points System + Round Label Updates

---

#### Community Points System (new)

Full community activity tracking system added to the platform. Append-only audit log, member-facing dashboard stat card, admin management tools.

**Point Values (new constants)**

| Constant | Value | Action |
|----------|-------|--------|
| `PTS_POST` | 1 | Community feed post |
| `PTS_PVR` | 5 | Peer Review Request (WAC-only, not wired in SMAC) |
| `PTS_RER` | 10 | Expert Review Request (WAC-only, not wired in SMAC) |
| `PTS_BACKLINK` | 15 | Backlink directory listing (first add only) |
| `PTS_COWORK_RSVP` | 2 | Coworking RSVP |
| `PTS_COWORK_ATTEND` | 5 | Coworking attendance (admin-awarded) |

**`logCommunityPts(uid, name, action, pts)`**
- Fire-and-forget async helper — never awaited at call sites
- Writes to `smac_community_pts` collection: `{ uid, name, action, pts, ts: Date.now() }`
- Silently swallows errors (`console.warn` only) — failure never blocks the triggering action
- Uses dynamic `import()` to avoid adding to the module's top-level import chain
- Collection is append-only — no edits or deletes

**Call sites wired**
- `submitPost()` — fires `'Feed Post'` / `PTS_POST` on every successful community feed post

**Call sites not wired (WAC-only features, not built in SMAC)**
- `submitPVR`, `submitRER` — Peer/Expert Review not in SMAC scope
- `saveListing`, `removeListing` — Backlink directory not yet built in SMAC
- Zoom RSVP dedup via `smac_zoom_rsvps/{key}_{uid}` — not yet built in SMAC

**Dashboard stat card**
- 5th card added to the `dash-stats-grid`: "🌟 Community Pts" (`id="dash-val-comm"`)
- Value is derived: `communityPts = Math.max(0, totalPts - postPts - engPts)` — no new Firestore field
- Count-up animation at 440ms delay (staggered after existing 4 cards)
- `_renderDashboard()` signature updated to include `communityPts` as an explicit parameter
- All 3 call sites updated: success path (derived value), `useLocalFallback` path (`0`), catch block (`0`)

**Coworking Card (member-facing)**
- Mount div `#dash-cowork-card-mount` added to dashboard HTML (hidden by default)
- `loadCoworkCard()` fires on every dashboard load
- Queries `smac_coworking_sessions` for `active == true`; hides mount if no active session
- If active session found: shows label + "RSVP +2 pts" button
- On RSVP: checks `smac_coworking_sessions/{sessionId}/rsvps/{uid}` subcollection for dedup
- If new: writes rsvp doc, `increment(PTS_COWORK_RSVP)` on `smac_registry`, `logCommunityPts()`
- Opens `calendarUrl` if set after RSVP
- Button updates to "RSVP'd!" (disabled) with "Attend to earn +5 pts" subtext
- One RSVP per session enforced via subcollection doc write (Firestore-backed, not localStorage)

**Admin Reports page — 3 new panels (admin-only, shown/hidden on login)**

1. **Coworking Sessions Manager** (`#admin-cowork-tool`)
   - Create session: label + optional Google Calendar URL field
   - `calendarUrl` always stored as `''` (not `null`) for Firestore type consistency
   - Session list: Close/Reopen toggle, Delete, "Mark Attendees" expander
   - "Mark Attendees": loads registry members as checkboxes; already-awarded members pre-checked and disabled with "✓ Awarded" label
   - "Award +5 pts to Checked": loops unchecked members only; writes attendee subcollection doc, `increment(PTS_COWORK_ATTEND)`, `logCommunityPts()`
   - Functions: `adminCreateCoworkSession()`, `loadCoworkSessions()`, `adminToggleCoworkSession()`, `adminDeleteCoworkSession()`, `adminToggleAttendeePanel()`, `adminAwardAttendance()`

2. **Community Points Log** (`#admin-comm-pts-log`)
   - Reads all docs from `smac_community_pts`, sorted newest first (`orderBy('ts','desc')`)
   - Client-side filter by member (uid) and action type
   - Table columns: Member / Action / Pts (gold) / Date
   - Member dropdown auto-populated from registry (R3 members only, excluding admin)
   - Action filter options: Feed Post, Peer Review Request, Expert Review Request, Backlink Listing Added, Zoom RSVP, Coworking RSVP, Coworking Attendance
   - Refresh button
   - Functions: `loadCommPtsLog()`, `loadCommPtsMemberDropdowns()`

3. **Backfill Missing Points** (`#admin-backfill-pts`)
   - Select member + action → pts auto-fills from `_BACKFILL_PTS_MAP`
   - Manual override supported
   - Confirm dialog before write
   - On confirm: `increment(pts)` on `smac_registry`, `logCommunityPts(..., action + ' (backfill)', pts)`
   - Refreshes log table after award
   - Function: `adminBackfillPts()`, `backfillAutoFillPts()`

**`_BACKFILL_PTS_MAP` constant**
```js
{ 'Feed Post': 1, 'Peer Review Request': 5, 'Expert Review Request': 10,
  'Backlink Listing Added': 15, 'Zoom RSVP': 2, 'Coworking RSVP': 2,
  'Coworking Attendance': 5, 'Manual Adjustment': '' }
```

**New Firestore collections**
| Collection | Purpose |
|------------|---------|
| `smac_community_pts` | Append-only community activity audit log |
| `smac_coworking_sessions/{sessionId}` | Session docs: `label`, `active`, `calendarUrl`, `createdAt` |
| `smac_coworking_sessions/{sessionId}/rsvps/{uid}` | RSVP dedup subcollection |
| `smac_coworking_sessions/{sessionId}/attendees/{uid}` | Attendance award tracking |

**"How Points Work" section updated (Rankings page)**
- Added missing modifiers: Weekly Challenge (+5) and Show Your Face (+5)
- Added "Community Points" subsection: feed post (+1), backlink (+15), coworking RSVP (+2), coworking attendance (+5)

---

#### R3 Round Label Updates

Two hardcoded "Round 2" labels updated to "Round 3":
- **Login screen badge:** `Round 2 · March–May 2026` → `Round 3 · June–August 2026`
- **Dashboard welcome line:** `Round 2 · Week —` → `Round 3 · Week —`

All other Round 2 references (renewal card, feedback card, tracker header, directory subtitle, leaderboard meta, round-ended banner) intentionally left in place — members need access to R2 data for the first few days of R3.

---

#### R3 Leaderboard — Missing Members Fix

**Root cause:** `_resolveActiveRound()` correctly flipped `CURRENT_ROUND` to `"R3"` at midnight June 1, but the leaderboard filter `(m.rounds||[]).includes(CURRENT_ROUND)` excluded all R2 members whose `smac_registry` docs had not yet been enrolled in R3.

**Fix:** Browser console script run by admin to `arrayUnion("R3")` onto every R2 member's `rounds` field:
- Touched only members with `"R2"` in `rounds` and without `"R3"` already present
- ~50 members enrolled in one pass
- Non-renewers will be cleaned up manually via the admin Directory panel (toggle R3 off per member)
- New R3-only members handled automatically by Make.com on signup

**Key learning:** Any time `CURRENT_ROUND` advances, existing members need `arrayUnion(newRound)` applied to their `smac_registry` docs before the leaderboard, directory, and enrollment checks will include them. This is now a documented R3→R4 transition task.

---

### June 1, 2026 — Round 2 Close: Points Integrity Audit System + Round 2 Winner Resolution

---

#### Points System — R2 Ceiling Verified

R2 theoretical max for a base member across 10 scoring weeks (W3–W12):

| Source | Calc | Max |
|--------|------|-----|
| On-time submissions | 22 posts × 10 | 220 |
| Format bonus (Reel or Carousel) | 22 posts × 2 | 44 |
| Modifiers (Challenge OR SYF, 1 each per week) | 10 weeks × (5+5) | 100 |
| Engagements | 10 weeks × 5 × 2 | 100 |
| **Total** | | **464** |

Corrected rule (confirmed this session): Challenge and SYF are **independent limits** — max 1 Challenge per week AND max 1 SYF per week. They can both be applied to separate posts in the same week. Previous assumption (mutually exclusive) was wrong.

W1 and W2 confirmed clean: 0 engagement submissions across all 50 members in grace weeks (verified via browser console query).

---

#### Submissions Viewer — Combined Filters

Both the week dropdown and member dropdown are now always visible regardless of view mode (By Member / By Week). Filters combine simultaneously — selecting both a member and a week shows only that member's submissions for that week. Render gate updated: shows results if either filter is set.

**`setSubView`** — no longer toggles filter visibility; mode only affects grouping/sort.
**`renderSubViewer`** — applies all active filters simultaneously regardless of mode.
**Member dropdown default** changed from "Select a member…" to "All Members".

---

#### Point Audit Tool (new admin tool)

Located on the Reports page below the Points Integrity Sweep. Admin-only.

**Single-member audit (`runPointsAudit`)**
- Fetches all `submissions` + `engagements` docs for one member
- Groups by week, computes theoretical max per week, flags anomalies
- **Flag rules (corrected this session):**
  - Grace-week post pts > 0
  - Posts in a week exceeding the weekly required count
  - Engagements in a week exceeding `MAX_ENG_PER_WEEK` (5)
  - Week total exceeding theoretical max
  - `challengeApplied` count > 1 in same week (duplicate Challenge)
  - `syfApplied` count > 1 in same week (duplicate SYF)
  - Challenge + SYF on separate posts in same week = NOT flagged (valid)
- Shows week-by-week summary table + full submission detail + full engagement detail
- Duplicate modifier submissions show `⭐⚠` or `🎥⚠` with red Fix buttons

**All-members audit (`runPointsAuditAll`)**
- Second button added: "Run All Members"
- 3 Firestore reads total regardless of member count (registry + submissions + engagements)
- Evaluates every member against same flag rules
- Compact summary table sorted by flag count descending
- "Full Audit →" button on flagged rows expands the full single-member ledger inline via `drillAuditMember()`

**Fix tool (`applyAuditCorrection`)**
- Triggered from Fix buttons in submission detail
- Confirm dialog shows week, modifier type, pts impact, and member name before writing
- 4 atomic writes on confirm:
  1. Strips modifier flag (`challengeApplied: false` or `syfApplied: false`) on submission doc
  2. Recalculates and writes corrected `pts` (−5)
  3. Decrements `registry.points` by delta
  4. Writes audit doc to `corrections` Firestore collection
- Row turns green with "✓ Fixed" pill after correction — no full re-render
- `corrections` doc schema: `submissionId, uid, memberName, weekIdx, weekLabel, correctionType, modifierType, modifierLabel, oldPts, newPts, ptsDelta, correctedBy, correctedByEmail, correctedAt, reason, notified`

---

#### Cloud Function — `onCorrectionCreated` (`functions/index.js`)

Triggers on every new `corrections` collection doc. Sends a plain-text email notification to the affected member via Gmail SMTP (Nodemailer).

- Secret: `GMAIL_APP_PASSWORD` — Google Workspace app password for `info@joinsmac.com`
  - Set via: `echo "password" | firebase functions:secrets:set GMAIL_APP_PASSWORD --data-file -`
- Looks up member email from `smac_registry` by uid
- Sends from `info@joinsmac.com` with subject "SMAC — Points Correction Applied to Your Account"
- Email body includes: week, modifier type, reason, old pts, new pts, delta
- Updates `corrections` doc: `notified: true, notifiedAt, notifiedTo` on success; `notified: false, notifyError` on failure
- `nodemailer` added to `functions/` dependencies

---

#### R2 Integrity Sweep Results

Run All Members found 8 flagged members:

| Member | Issue | Action |
|--------|-------|--------|
| Angela Singleton | 2× Challenge in May Week 1 | Fixed — 459 → 454 |
| Farah Dailey-Reese | 2× Challenge in May Week 3 | Fixed — 459 → 454 |
| Tieast Plummer | 6 engagements in May W2, W3 | Left — R2 closed, not prize-relevant |
| Kia Boone | 8 engagements in March W4 | Left — R2 closed, not prize-relevant |
| Michele Johnson | 12 engagements in May W4 | Left — R2 closed, not prize-relevant |
| Sharon Thompson | 8 engagements in April W2 | Left — R2 closed, not prize-relevant |
| Anthony LaMothe | 4 posts in May W1 (max 3) | Left — not prize-relevant, worth investigating |
| Yana Rose | 2× Challenge in April W3 | Left — not in prize contention |

Engagement over-limit cases: system gap in R2, not intentional. Will enforce stricter limits in R3.

---

#### Round 2 Winners — Historic 5-Way Tie

After corrections, 5 members finished at 454 pts (verified max for their activity patterns, below the 464 ceiling):

- 🏆 Angela Singleton — @asinglephoto
- 🏆 Shenna Hair — @shair_branding
- 🏆 Malik Mack — @malik_mrmultistreams_mack
- 🏆 Farah Dailey-Reese — @Fdrphotography_
- 🏆 Austin Hill — @yrnphoto

**Prize structure decision:** Top 5 vote on format:
- Option A — Spin the wheel: 1 winner takes $200
- Option B — Split: each gets $45 (exact Round 2 buy-in back)

$50 random giveaway drawn from remaining 45 members.

Announced as a historic moment — first time in SMAC history 5 members hit the ceiling in the same round.

---

#### Key Learnings for Round 3

- **Modifier rules clarified:** Challenge and SYF are independent per-week limits (max 1 each), not mutually exclusive. The platform's submit-time enforcement (mutual exclusion) was stricter than the intended rule. Consider updating enforcement logic for R3 to allow both in same week on separate posts.
- **Engagement limit enforcement:** The platform does not currently block engagement submissions in W1/W2 or over-limit engagements. Add enforcement in R3.
- **Emily Heath duplicate registry doc:** Two `smac_registry` docs exist for Emily Heath (same name, same points). Likely a Make.com double-webhook. Inflates member count to 51. Needs manual Firestore cleanup — identify which doc has the correct Auth UID and delete the orphan.
- **Leaderboard post count:** Pulls from `totalPosts` on registry doc (incremented on submission), not the tracker (manually checked). These can drift. The number shown is submissions, not tracker checkboxes.
- **Round transition checklist (new):** When `CURRENT_ROUND` advances, run `arrayUnion(newRound)` on all returning members' `smac_registry` docs before the leaderboard goes live. Make.com handles new signups; only returning members need the backfill.

---

## Who Is Nate?

**Nate Templeton** — Baltimore-based destination wedding videographer and solopreneur. Founder of SMAC, WAC, and FAC. Non-technical but highly capable of following step-by-step instructions. Manages all tools himself. Design sensibility is sharp — gives clear, iterative feedback on spacing, text size, and mobile readability.

- Email: info@joinsmac.com
- Admin Firebase email: nate@templetonimage.com

---

## What Is SMAC?

**SMAC = Social Media Accountability & Consistency**

A paid 90-day Instagram posting challenge for solopreneurs and creatives. Built around group accountability, structured posting requirements, community, and cash prizes.

> "Challenge" was retired from the full name. "Consistency" replaces it because it describes the transformation. The acronym is unchanged.

**Core mechanics:**
- Members post to Instagram on a ramping weekly schedule
- Nate personally verifies every post by date/time — no self-reporting
- Members who miss 2 consecutive weekly minimums are removed from the Instagram Group Chat (but keep platform access)
- Members can recommit and return anytime
- End-of-round cash prizes: All-Star Prize ($100+) and Finisher Prize ($50+), both grow as more members join

**Round structure:** 3 rounds per year
- Round 2: March–May 2026
- Round 3: June–August 2026 ← SMAC Pro launches here
- Round 4: Sept–November 2026

**Round 1** was free (60+ members). Round 2 onward is paid.

---

## Brand Positioning

### Tier Positioning Statements

**SMAC (free/base):** "Build the habit. Show up consistently."
**SMAC Pro (paid):** "You've built the habit. Now make it count."

These lines are intentional mirrors — Pro reads as a direct graduation from the base tier, not just a feature upgrade.

### What SMAC Is
- A behavior system
- A consistency engine
- A discipline builder

### What SMAC Is Not
- A content tool
- An AI product
- A replacement for creative judgment

---

## Round 2 Launch Status (as of March 18, 2026)

- **Enrollment:** CLOSED (cap of 50 hit, closed March 14)
- **Official challenge start:** March 15, 2026 (Week 3)
- **Weeks 1–2 (March 1–14):** Grace period — points and submissions reset before official launch
- **Giveaway winner:** Briana Seda-Stringer — free Round 2 spot, manually added
- **Total members:** 50
- **Returning from Round 1:** ~35+
- **Founder's Rate:** SOLD OUT (5 of 5 claimed within an hour of launch)
- **Kickoff Zoom:** Hosted March 15, 2026 at 4pm ET

---

## Product Tiers

### Current — SMAC (Round-Based)

| Tier | Price | Access |
|------|-------|--------|
| Round 2 Only | $45 | March–May 2026 |
| Founder's Rate | $100 | Rounds 2, 3, 4 (SOLD OUT) |

- Stripe Round 2 link: `https://buy.stripe.com/eVq7sLadRfnxdq6eBrbo400`
- Stripe Founder link: `https://buy.stripe.com/cNifZhgCf5MX99Qalbbo401`
- No pricing in social posts (algorithm suppression risk) — always drive to joinsmac.com
- Round 3 waitlist: `https://forms.gle/vLc74ZK5yJ3FqASx9`

### SMAC SMS Add-On (Standalone, Round 3+)

Base SMAC members who want SMS deadline reminders without upgrading to Pro.

| Price | Access |
|-------|--------|
| $19 | SMS reminders only for the 90-day round |

- Stripe product created with metadata: `product: smac_sms`
- Detected in `stripeWebhook` via `session.metadata.product === 'smac_sms'`
- Sets `hasSMS: true` on member's `smac_registry` doc
- `userHasSMS()` helper: returns true if `userHasPro()` OR `currentUser.hasSMS === true`
- SMS card CTA for base members: split prompt — "Add SMS Reminders — $19" (primary) + "Upgrade to SMAC Pro" (secondary)
- Login handler must read `hasSMS` into `currentUser` (one-line addition, not yet built)
- **Status:** Pending Twilio compliance approval + Stripe `price.id` confirmation before build

### SMAC Pro (Paid Premium Tier)

The 90-Day Content Discipline System. All infrastructure built into the platform, gated by `userHasPro()`.

**Pricing decision (May 2026):**

| Tier | Price | Notes |
|------|-------|-------|
| Introductory rate (7-day launch window) | $65 | Early adopter reward |
| Evergreen member price | $87 | Members-only, inside the app |

**Rationale:** $65 launch / $87 evergreen chosen over the original $97/$147 anchors because Zoom guest speaker sessions are no longer a core pillar (delivery risk — depends on others). Zooms remain as occasional bonuses when available. AI features built and live justify the price on their own. $65 was chosen as the introductory rate — clean number, low friction, rewards early adopters.

**Revenue target at launch:** Realistic $5K–$8K at this price point with 50 warm Round 2 grads.

**Launch timeline:** Announce mid-to-late May 2026. 7-day introductory window, then evergreen at $87 (members-only, gated inside the app — not publicly listed).

**Graduation path:** Round 2 completers receive a direct invitation email before public announcement.

**Stripe Payment Link (Round 3):** `https://buy.stripe.com/00w4gzdq34IT1Ho0KBbo407`

---

## SMAC Pro — Feature Status (as of May 9, 2026)

### Built and Live

All four AI features are fully functional in the platform, gated by `userHasPro()`, using `claude-haiku-4-5-20251001` with prompt caching on system prompts.

**1. Content Performance Analysis** (`#pro-analytics-card`)
- Member fills caption + engagement stats manually, OR uploads two screenshots side-by-side (post + insights), OR any combination
- **Two-step Vision (added May 20, 2026):**
  - Slot 0 = post screenshot. Triggers pre-flight extract on upload (`runCpaPreflightExtract`); reads caption/format/visual description into a confirmation card with [Use these] / [Ignore] buttons
  - Slot 1 = insights screenshot. Vision reads engagement numbers directly during main analysis
- **Output now STRICT JSON (refactored May 20, 2026)** — rendered via `renderCpaResult(d)` helper
- AI returns: Overall Score /10, **Visual/Caption Coherence /10** (when post screenshot present), What Worked, What to Improve, **What to Repeat** (patterns to carry forward), **What to Try** (patterns to experiment with), optional footnote sources
- "What to Repeat" + "What to Try" replaced the old "Next Post Recommendation" to prevent overlap with the Weekly Action Plan tool. CPA is now a learning tool (pattern extraction); WAP is the planning tool (calendar).
- **Source citations:** same 7 vetted 2025/2026 IG sources as Snapshot, optional and light-touch (max 2 per analysis, empty array expected most of the time). Renders footnote at bottom of result when used.
- Scoring rubric: Saves 30% / Shares 25% / Hook 20% / Visual coherence 15% / Caption depth 10%. Coherence section skipped + weight reallocated to hook strength when no post screenshot.
- State: `_cpaScreenshots = [null, null]` (slot 0 = post, slot 1 = insights), `_cpaExtracted` holds pre-flight result
- Functions: `runContentAnalysis()`, `resetContentAnalysis()`, `runCpaPreflightExtract()`, `applyCpaExtracted()`, `handleCpaScreenshot(input, slot)`, `clearCpaScreenshot(slot)`, `renderCpaResult(d)`
- System prompts: `_CPA_SYSTEM_PROMPT` (main analysis, includes source library), `_CPA_EXTRACT_PROMPT` (pre-flight) — both cached
- Cost: ~$0.018 per session worst case (both screenshots + sources), well under $10/month even at 100 Pro members

**2. Caption Assist** (`#pro-caption-card`)
- Inputs: post idea, format (Reel/Carousel/Static/Story), goal, tone
- Output: 3 distinct ready-to-edit captions, each labeled by hook type
- Built on 2026 Instagram best practices: HVC formula, hook under 80 chars, no AI-sounding openers, keyword-first over hashtags, saves/shares CTAs prioritized
- Reminder displayed: "Edit before posting — make it sound like you."
- Functions: `runCaptionAssist()`, `resetCaptionAssist()`
- System prompt constant: `_CA_SYSTEM_PROMPT`, cache: `_CA_CACHE_CONTROL`

**3. Weekly Action Plan Generator** (`#pro-action-plan-card`)
- Inputs: niche/business (auto-filled from `smac_profile_{uid}` localStorage), posts per week (3–7, default 5), last week's content, current focus
- Auto-fills niche via `wapPrefillFromProfile()` called from `renderProTool('wap')` after render
- Pulls live `weekIdx` via `getWeekIndex(Date.now())` — AI knows which of 12 weeks it is
- Output: day-by-day plan with topic, hook angle, format, and "why this week" rationale per post; closes with a single "this week's priority" line
- 2026 strategy baked in: DM shares + saves weighted highest, content pillar variety enforced, max 1 promotional post per week
- **Plan history:** saves to Firestore `pro_plans` collection; last 3 plans injected as context on next generation to avoid repetition; history accordion visible in tool view
- Functions: `runActionPlan()`, `resetActionPlan()`, `wapPrefillFromProfile()`, `saveActionPlan()`, `loadWapHistory()`, `toggleWapHistory()`
- Module-level state: `_wapCurrentPlanText`, `_wapCurrentWeekIdx`, `_wapCurrentWeekLabel`
- System prompt constant: `_WAP_SYSTEM_PROMPT`, cache: `_WAP_CACHE_CONTROL`

**4. Hook Generator** (`#pro-hook-card`)
- Inputs: post topic, format (Reel spoken, Reel text overlay, Carousel slide 1, Static caption)
- Output: 5 hooks, one per hook type, each rendered as a tap-to-copy card
- Hook types: Curiosity Gap, Contrarian, Tension/Mid-Story, Transformation, Bold Claim
- 2026 rules enforced: under 80 chars, never starts with "I", no guru phrases, human-first, open-loop structure
- Tap any card → copies hook text to clipboard, shows "Copied!" confirmation
- Functions: `runHookGenerator()`, `resetHookGenerator()`, `copyHook()`
- System prompt constant: `_HG_SYSTEM_PROMPT`, cache: `_HG_CACHE_CONTROL`

**5. SMS Deadline Reminders** (`#pro-nudges-card`)
- Replaces the "Coming at Pro Launch" placeholder on the PRO tab
- Four-state card: opt-in form (State A) → confirmed active (State B) → edit/unsubscribe (State C) → opted out (State D)
- Phone input + TCPA-compliant consent checkbox; phone formatted to E.164 on save
- Writes `phone` and `smsOptIn: true/false` to member's `smac_registry` doc via `updateDoc()`
- State read live from Firestore on every PRO page visit via `renderSmsCard()`
- Access gated by `userHasSMS()` — returns true if `userHasPro()` OR `currentUser.hasSMS === true`
- Pro members: included. Base members: available as a standalone $19 add-on (see SMS Add-On below)
- Functions: `renderSmsCard()`, `saveSmsOptIn()`, `dismissSmsOptIn()`, `showSmsEdit()`, `cancelSmsEdit()`, `updateSmsPhone()`, `unsubscribeSms()`, `showSmsOptInForm()`, `_formatPhone()`
- SMS delivery handled by Firebase Cloud Functions + Twilio (see Cloud Functions section)
- **Status:** `userHasSMS()` helper and `hasSMS` field not yet built — pending Twilio compliance approval and Stripe add-on setup

**6. Upgrade to Pro Card (Profile page)**
- Dark gold card shown to free (non-Pro, non-admin) members on the Profile page
- Links directly to Stripe Payment Link: `https://buy.stripe.com/00w4gzdq34IT1Ho0KBbo407`
- Hidden automatically for Pro members and admin via `renderProfileUpgradeCard()` on every profile page load
- Element ID: `#profile-upgrade-card`

### Still Scaffolded (Coming Soon)

- **Priority Accountability Group** (`#pro-priority-group-card`) — planned
- **Early Access to New Features** (`#pro-early-access-card`) — informational

### On the Horizon

- **Post Audit** — member pastes their own caption, AI gives line-by-line feedback
- **Content Pillar Builder** — one-time setup, returns 4–5 pillars with post ideas per pillar
- **Monthly Content Generator** — 4-week plan with theme continuity; build after weekly planner is proven
- **Smart SMS Reminders (Version B)** — Round 4 / 2026–2027 restart; reads `submissions` collection per member per week, personalizes message based on posts done vs. required

---

## Analytics Snapshot

### Overview

Member uploads a screenshot of their Instagram 90-day Insights. Claude Vision extracts the metrics, generates a narrative, and saves a permanent record. Available to all members during active windows; Pro members get a comparison chart.

### Upload Flow

1. Member taps banner on Dashboard during active window
2. Uploads screenshot of IG Insights (90-day view)
3. Claude Vision (`claude-haiku-4-5-20251001`) extracts metrics + comparison % vs. previous 90 days
4. Platform pulls SMAC submission count from `submissions` collection
5. Result modal shows: SMAC submission hero card, AI narrative, IG metric cards with delta pills, Pro chart
6. Banner disappears after capture; permanent record lives in Profile > Growth History

### Hero Metric: SMAC Submission Count

The headline metric is SMAC posts submitted (not IG views) to anchor the experience around what members controlled. Pulled from the `submissions` collection using `uid`-only Firestore query plus client-side filter (ts within round window, status !== "grace"). This avoids needing a Firestore composite index.

### Context-Aware AI Narrative

The system prompt instructs Claude to categorize the snapshot into 5 `trendTier` buckets based on the Views % change (or Reach if Views unavailable):

- **strong_growth** (> +15%) — celebrate growth, tie to consistency
- **modest_growth** (+5% to +15%) — acknowledge real progress
- **steady** (-5% to +5%) — frame as a win given IG's noise
- **modest_dip** (-15% to -5%) — honest acknowledgment, refocus on consistency
- **significant_dip** (< -15%) — name the broader context (algorithm shifts, bot purges), refocus on posting as the real win

Prompt explicitly forbids exclamation overuse, words like "amazing" or "incredible", and sugarcoating dips.

### Active Windows

Configured in `getSnapshotWindow()`:

| Round | Type | Window |
|-------|------|--------|
| R2 | end | May 25 – June 8, 2026 |
| R3 | start | May 25 – June 14, 2026 |
| R3 | end | Aug 24 – Sept 7, 2026 |

Override for testing: `window._SNAP_WINDOW_OVERRIDE = { type, title, subtitle }` in console.

### Firestore Schema

**Collection:** `analytics_snapshots`
**Doc ID:** `{uid}_{round}_{type}` (e.g. `abc123_R2_end`)

```javascript
{
  uid: string,
  registryId: string | null,
  round: "R2" | "R3" | ...,
  type: "start" | "end",
  capturedAt: timestamp,
  data: {
    views: number | null,
    viewsChangePct: number | null,
    reach: number | null,
    reachChangePct: number | null,
    profileVisits: number | null,
    profileVisitsChangePct: number | null,
    followerChange: number | null,
    followerTotal: number | null,
    interactions: number | null,
    interactionsChangePct: number | null,
    topMetric: string,
    period: string,
    trendTier: "strong_growth" | "modest_growth" | "steady" | "modest_dip" | "significant_dip",
    narrative: string,
    smacSubmissionCount: number | null,
    recommendations: [          // added May 20, 2026 — may be absent on pre-build snapshots
      {
        metric: "views" | "reach" | "profileVisits" | "interactions" | "followerGrowth" | "consistency",
        headline: string,       // 5-7 word action label
        action: string,         // 2-3 sentences: action + why
        sourceKey: string       // key into _SNAP_SOURCES lookup
      }
    ]
  }
}
```

### AI Recommendations (added May 20, 2026)

System prompt generates up to 3 prioritized recommendations grounded in 7 vetted 2025/2026 IG growth sources. Tier-aware distribution; every rec references one of three threads: consistency, accountability (SMAC program), or analytics literacy.

**Source library (`_SNAP_SOURCES` constant in platform):**

| sourceKey | Label |
|-----------|-------|
| `mosseri_2025` | Mosseri, IG Algorithm Update (Jan 2025) — 3 ranking signals |
| `buffer_freq_2025` | Buffer 2M-post study — 3-5 posts/week doubles growth |
| `mosseri_shares_2025` | Mosseri on DM sends — weighted 3-5x higher than likes |
| `meta_topic_2025` | Meta "Your Algorithm" (Dec 2025) — last 9-12 posts set category |
| `buffer_carousel_2025` | Buffer carousel data — 3.1x higher engagement |
| `mosseri_original_2025` | Mosseri original-content policy — aggregators lost 60-80% |
| `meta_keywords_2025` | Meta keywords update — captions drive 30% more reach |

**Rendering (`renderSnapshotRecommendations` helper):**
- Base: 1 rec card + soft upgrade nudge + sources footnote for that 1 rec
- Pro: 3 rec cards + sources footnote for all 3
- Backward-compat: returns `""` if `recommendations` field missing or empty
- Footnote sources link to original articles, only sources actually used in the shown recs are listed
- Render order in modal: hero → narrative → IG cards → **recs (new)** → chart → Done

**Cost:** ~$0.005 per snapshot (Haiku 4.5 + cached system prompt + 1100 max output tokens).

### Submission Collection Update

Both submission writes (regular + grace token) now include `round: window.CURRENT_ROUND || "R2"`. This future-proofs per-round queries; existing R2 submissions without the field still work via the timestamp-range filter.

### Key Functions

- `openSnapModal(type)` — opens upload modal
- `handleSnapScreenshot(input, slot)` — slot is 1 or 2
- `runSnapshotAnalysis()` — sends both images to Vision in one API call
- `getRoundSubmissionCount()` — uid-only query + client filter (no composite index needed)
- `renderSnapshotResult(d)` — hero + narrative + IG cards + chart
- `drawSnapshotChart(latest)` — Chart.js, auto-detects if both start+end exist
- `renderSnapshotBanner()` — Dashboard banner during active windows only
- `renderGrowthHistory()` — Profile section listing all past snapshots
- `viewMySnapshot(type)` / `viewSnapshotByRound(round, type)` — re-open saved snapshots

### Tech Notes

- Chart.js loaded via CDN: `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js`
- Reuses existing Cloudflare Worker AI proxy (`smac-ai-proxy.templetonimage.workers.dev`)
- Prompt caching via `_SNAP_CACHE_CONTROL = { type: "ephemeral" }`
- Modal uses `.member-modal-overlay` with `.open` class (consistent with renew/resource modals)
- Banner has `class="dash-animate"` which starts at `opacity:0`; `renderSnapshotBanner` explicitly sets `opacity:1` after rendering for console-triggered cases

### Future Phase 2 (Tracker Debug Required)

When the tracker is confirmed working, add a third metric to the hero/secondary section: # of actual Instagram posts (pulled from `trackers` collection). Currently parked due to known tracker reliability issues.

---

## Points System

### Point Values

| Action | Points |
|--------|--------|
| On-time submission | 10 pts |
| Reel bonus | +2 pts |
| Carousel bonus | +2 pts |
| Engagement screenshot (like/comment/share/save) | +2 pts (max 5/week) |
| Weekly Challenge modifier | +5 pts |
| Show Your Face (SYF) modifier | +5 pts |
| Community feed post | +1 pt |
| Backlink directory listing (first add only) | +15 pts |
| Coworking RSVP | +2 pts |
| Coworking attendance (admin-awarded) | +5 pts |

Late submissions: not currently allowed (no grace period active in Round 3). `PTS_LATE_24H = 5` constant remains in code for future use.

### Source of Truth

`registry.points` on the member's `smac_registry` doc is the authoritative total. It is atomically incremented on every submission, engagement, and community activity write. The "My Post Submissions" log on the Submit page independently sums `submissions[].pts`; these two figures can drift if a registry `increment()` fails silently (network blip).

Community points are derived on the dashboard as `Math.max(0, totalPts - postPts - engPts)` — no separate stored field.

### Points Reconciliation System (built May 21, 2026)

**Problem:** Registry increment can fail silently, leaving `registry.points` lower than the sum of actual submission + engagement docs. Confirmed case: Farah Dailey-Reese had a +24pt delta (registry: 357, computed: 381). Fixed via the reconciliation tool.

**`runPointsReconciliation(uid, registryId, autoHeal)`**
- Fetches `registry.points`, sums all `submissions.pts` + `engagements.pts` for the given UID
- Delta = 0: logs `✅` to console, no UI action
- Delta ≠ 0: `console.warn` with full breakdown; admin sees a dismissible yellow banner in the UI with name, registry pts, computed pts, delta, and a "Fix Now" button
- `autoHeal = true`: immediately writes `registry.points = computedTotal` without a prompt
- Regular members: silent log only — no alarm shown
- Called automatically every time a member views their own profile (non-blocking, `.catch(()=>{})`)
- Also callable from browser console: `runPointsReconciliation('uid', 'registryId', true)`

**Admin "🔍 Check Points" button** — Reports page → Submissions Viewer → select a member → click button → runs reconciliation for that member; uses `lsGet("smac_registry")` to resolve name → UID → registryId.

**Points Integrity Sweep** (`#points-sweep-tool`) — admin-only tool in Reports:
- "Run Sweep" button fetches entire `smac_registry` + all `submissions` + all `engagements` in 3 Firestore reads (not N reads per member), indexes by UID, compares each member
- Results table: sorted by mismatch size (largest delta first), then alphabetical; columns: Member / Registry / Computed / Delta (color-coded)
- Summary line: "N members checked · X mismatches · Y OK"
- "Fix All Mismatches" button (red, appears only when mismatches exist): confirm dialog → writes corrections one by one with progress counter → re-runs sweep to show clean state
- `_sweepResults` module-level cache holds last sweep data for the fix-all pass

### Dashboard Zoom Card Position (updated May 21, 2026)

The dynamic Zoom card (`#dash-zoom-card-wrap`) was moved from the calendar/links block (below quick action buttons) to between the status pills and the stats grid. New render order on Dashboard:

1. Welcome / week label
2. Status pills (Post submitted / Tracker updated)
3. **Zoom card** (when active — populated by `loadZoomCard()` from `smac_config/zoom_card`)
4. Analytics Snapshot banner (upload window only)
5. **Coworking card** (when active session exists — `#dash-cowork-card-mount`)
6. **Round 3 renewal card** (with spot countdown — always visible until round closes)
7. Stats grid (Total Points / Post Points / Engage Points / Posts Made / Community Pts)
8. Quick action buttons
9. Calendar link
10. Weekly Challenge banner
11. All-Star progress
12. Top 10 Leaderboard

---

## Cloud Functions

All functions live in the `functions/` directory of the SMAC Platform project. Deployed to Firebase (project: `smac-2026`, region: `us-central1`). Node.js 24, firebase-functions v7.

### Deployed Functions

**`sendToMake`** (existing, unchanged)
- Trigger: Firestore `onDocumentCreated` on `engagements/{docId}`
- Pushes new engagement data to Make.com webhook
- Make webhook URL: `https://hook.us2.make.com/3jsjavf33h0oeu7qq5vgxvd34lyiyz5p`

**`stripeWebhook`** (new — May 9, 2026)
- Trigger: HTTP POST from Stripe
- URL: `https://us-central1-smac-2026.cloudfunctions.net/stripeWebhook`
- Event: `checkout.session.completed`
- Looks up member in `smac_registry` by `email == session.customer_details.email`
- Sets `isPro: true`, `proSince: serverTimestamp()`, `stripeSessionId` on Pro purchase
- Sets `hasSMS: true`, `smsSince: serverTimestamp()` on SMS add-on purchase (detected via `session.metadata.product === 'smac_sms'`)
- Guards against double-processing (already-Pro / already-hasSMS checks)
- Secret: `STRIPE_WEBHOOK_SECRET` (whsec_ signing secret from Stripe Dashboard)
- Stripe event destination configured in Stripe Dashboard > Developers > Webhooks
- **SMS add-on webhook update:** pending Twilio compliance approval + Stripe product setup

**`smsSendDay4Reminder`** (new — May 9, 2026)
- Trigger: Cloud Scheduler — `0 10 * * *` (10:00 AM ET daily)
- Checks if today matches any `day4` date in `SMAC_WEEKS` schedule
- Queries `smac_registry` for `(isPro == true OR hasSMS == true)` AND `smsOptIn == true`
- Sends: "SMAC check-in: Week X closes in 3 days on [Date]. Don't let the week slip..."
- Secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

**`smsSendFinalCall`** (new — May 9, 2026)
- Trigger: Cloud Scheduler — `59 11 * * *` (11:59 AM ET daily)
- Checks if today matches any `deadline` date in `SMAC_WEEKS` schedule
- Queries `smac_registry` for `(isPro == true OR hasSMS == true)` AND `smsOptIn == true`
- Sends: "Last call — SMAC Week X closes TONIGHT at 11:59 PM ET. Make it count."
- Same secrets as Day 4 reminder

### SMAC Round 3 Week Schedule (hardcoded in `SMAC_WEEKS`)

| Week | Range | Day 4 Reminder | Deadline / Final Call |
|------|-------|---------------|----------------------|
| 1 | Jun 1–7 | Jun 4 | Jun 7 |
| 2 | Jun 8–14 | Jun 11 | Jun 14 |
| 3 | Jun 15–21 | Jun 18 | Jun 21 |
| 4 | Jun 22–30 | Jun 25 | Jun 30 |
| 5 | Jul 1–7 | Jul 4 | Jul 7 |
| 6 | Jul 8–14 | Jul 11 | Jul 14 |
| 7 | Jul 15–21 | Jul 18 | Jul 21 |
| 8 | Jul 22–31 | Jul 25 | Jul 31 |
| 9 | Aug 1–7 | Aug 4 | Aug 7 |
| 10 | Aug 8–14 | Aug 11 | Aug 14 |
| 11 | Aug 15–21 | Aug 18 | Aug 21 |
| 12 | Aug 22–31 | Aug 25 | Aug 31 |

### Secrets (stored in Google Cloud Secret Manager)

| Secret | Value | Status |
|--------|-------|--------|
| `STRIPE_WEBHOOK_SECRET` | whsec_ signing secret | Live |
| `TWILIO_ACCOUNT_SID` | ACd47f76... | Placeholder — update when compliance approved |
| `TWILIO_AUTH_TOKEN` | (secured) | Placeholder — update when compliance approved |
| `TWILIO_FROM_NUMBER` | +10000000000 | Placeholder — update when Twilio number assigned |

**To update secrets after Twilio approval:**
```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_FROM_NUMBER
firebase deploy --only functions
```

### New Firestore Fields (smac_registry)

```javascript
phone:     "",     // string — E.164 format e.g. "+13125550000"; written by member via opt-in UI
smsOptIn:  null,   // boolean — true = opted in, false = opted out, null = never set (shows form)
```

### Dependencies (functions/package.json)

```json
"axios": "^1.13.6",
"firebase-admin": "^13.6.0",
"firebase-functions": "^7.0.0",
"stripe": "^14.0.0",
"twilio": "^5.0.0"
```

---

## Anthropic API Integration

### Key Setup

API key is held server-side in a **Cloudflare Worker proxy** — no key in the platform file.

```
Browser → https://smac-ai-proxy.templetonimage.workers.dev → Anthropic API
```

- Worker name: `smac-ai-proxy`
- Worker URL: `https://smac-ai-proxy.templetonimage.workers.dev`
- API key stored as Cloudflare secret: `ANTHROPIC_KEY`
- All four AI features point to the Worker URL with `Content-Type` header only
- Worker injects `x-api-key`, `anthropic-version`, and `anthropic-beta` headers server-side

To update the API key: `npx wrangler secret put ANTHROPIC_KEY` from the `~/smac-ai-proxy` directory.

### Model

All AI features use `claude-haiku-4-5-20251001` — cheapest current Claude model, sufficient quality for caption/hook/planning tasks.

### Prompt Caching

Every AI feature caches its system prompt using `cache_control: { type: "ephemeral" }`. The `anthropic-beta: "prompt-caching-2024-07-31"` header is required and included in every fetch call. Cache hits cost 10% of standard input token price.

### Cost Estimate

~$0.007–$0.011 per AI call. At 100 Pro members using features 3x/week: ~$12–25/month total. Anthropic uses a prepaid credits model — load $20 to start, set a monthly limit in the Limits sidebar after purchasing credits.

### Security Note

API key is fully server-side in the Cloudflare Worker — never in browser source. Mitigations: prepaid credits cap in Anthropic console, private GitHub repo.

---

## SMAC Pro — Technical Architecture

### Data Model Additions (smac_registry)

```javascript
// Pro fields — all default inactive
isPro:      false,   // boolean — true = active Pro access
proSince:   null,    // timestamp — when Pro was activated (set by stripeWebhook or admin toggle)
proExpiry:  null,    // timestamp — time-limited access (optional)
trialUntil: null,    // timestamp — manual trial expiry (admin-set)
stripeSessionId: null, // string — Stripe checkout session ID (set by stripeWebhook)

// SMS fields — set by member via in-app opt-in
phone:     null,    // string — E.164 format
smsOptIn:  null,    // boolean or null

// SMS Add-On field — set by stripeWebhook on add-on purchase
hasSMS:    false,   // boolean — true = standalone SMS add-on purchased ($19); no Pro required
smsSince:  null,    // timestamp — set by stripeWebhook on SMS add-on purchase
```

### `userHasPro()` Helper

```javascript
function userHasPro() {
  if (!currentUser) return false;
  if (currentUser.isAdmin) return true;
  if (currentUser.isPro === true) return true;
  if (currentUser.trialUntil && Date.now() < currentUser.trialUntil) return true;
  return false;
}
```

Companion helpers: `userHasTrial()`, `getTrialExpiryStr()`.

### Pro Weekly Targets

```javascript
const PRO_WEEK_TARGETS = [3,3,3,3, 4,4,4,4, 5,5,5,5];
// Month 1 (Weeks 1–4): 3 posts/week
// Month 2 (Weeks 5–8): 4 posts/week
// Month 3 (Weeks 9–12): 5 posts/week
```

### Launch Control Flags

```javascript
const _PRO_GLOBAL_ACTIVE = false; // flip true at Pro launch — shows Global Enable Pro panel
const _PRO_NOTIFS_ACTIVE = false; // flip true at Pro launch — activates notification sequence
```

### Payment Flow (Automated)

1. Member clicks "Upgrade to SMAC Pro" → opens Stripe Payment Link in new tab
2. Member completes checkout (Stripe collects email)
3. Stripe fires `checkout.session.completed` to `stripeWebhook` Cloud Function
4. Cloud Function looks up member by email in `smac_registry`, sets `isPro: true` automatically
5. Member sees Pro features on next login (no manual admin action required)

Admin manual override still available via Directory panel (`toggleProAccess()`).

### In-App Notification Sequence (built, inactive)

| Trigger | Message |
|---------|---------|
| First login after Pro activated | Welcome to SMAC Pro — features are active |
| Day 3 after proSince | Nudge to try the Weekly Action Plan Generator |
| Day 7 after proSince | Check-in reinforcing Pro analytics value |

Each fires once per user (tracked in localStorage). Dismissable banner with "Open PRO" button, auto-dismisses after 10 seconds.

### User Access Matrix

| Feature | Free | Trial | SMS Add-On | Pro | Admin |
|---------|:----:|:-----:|:----------:|:---:|:-----:|
| Community (feed, chat, tracker, leaderboard, resources) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Weekly camera prompts (Show Your Face) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Weekly Action Plan Generator | Locked | ✓ | Locked | ✓ | ✓ |
| Caption Assist | Locked | ✓ | Locked | ✓ | ✓ |
| Content Performance Analysis (AI) | Locked | ✓ | Locked | ✓ | ✓ |
| Hook Generator | Locked | ✓ | Locked | ✓ | ✓ |
| SMS Deadline Reminders | Locked | Locked | ✓ | ✓ | ✓ |
| Priority accountability group | Locked | Locked | Locked | ✓ | ✓ |
| Early access to new features | Locked | Locked | Locked | ✓ | ✓ |
| Admin panel | — | — | — | — | ✓ |

---

## Tech Stack

### Landing Page
- **URL:** https://www.joinsmac.com
- **File:** `index.html` on GitHub Pages
- **Repo:** `templetonimage.github.io/smac` (CNAME → joinsmac.com)

### Community Platform
- **URL:** https://app.joinsmac.com
- **Repo:** github.com/templetonimage/smac-community
- **Stack:** Single `index.html` PWA + `manifest.json` + `sw.js` + icons (~8,037 lines as of May 9, 2026)
- **Database:** Firebase Firestore (project: `smac-2026`)
- **Auth:** Firebase Email/Password
- **Storage:** Firebase Storage (profile photos)
- **AI:** Anthropic API (`claude-haiku-4-5-20251001`) via Cloudflare Worker proxy
- **Cloud Functions:** Firebase Functions (Node.js 24) — Stripe webhook, SMS reminders, Make.com bridge
- **SMS:** Twilio (pending compliance approval — Twilio number TBD)
- **Hosting:** GitHub Pages (CNAME: app → templetonimage.github.io)
- **Note:** No third-party community platform. Fully self-built.

### Firebase Config
```javascript
const FIREBASE_CONFIG = {
  apiKey: [split across _a + _b],
  authDomain: "smac-2026.firebaseapp.com",
  projectId: "smac-2026",
  storageBucket: "smac-2026.firebasestorage.app",
  messagingSenderId: "533376960532",
  appId: "1:533376960532:web:3c969a34e05dd26b30bf01"
};
```

### Key Firestore Collections

| Collection | Purpose |
|------------|---------|
| `smac_registry` | Member records — source of truth for points, Pro status, SMS |
| `submissions` | Post submissions — each doc has `pts`, `weekIdx`, `status`, `syfApplied`, `challengeApplied`, `round` |
| `engagements` | Engagement logs — each doc has `pts`, `weekIdx`, `type` |
| `trackers` | Tracker checkbox state per member (doc ID = Firebase Auth UID) |
| `pro_plans` | WAP history — last 3 plans per member injected as AI context |
| `analytics_snapshots` | Growth snapshots — doc ID `{uid}_{round}_{type}` |
| `smac_config` | Admin-controlled config docs (e.g. `zoom_card`) |
| `app_config` | App-level settings (e.g. `r3_seats` — spot availability) |
| `smac_community_pts` | Community activity audit log (append-only) |
| `smac_coworking_sessions` | Coworking session management |
| `announcements` | Feed announcements |
| `feed` | Social wall posts |
| `polls` | Feed polls |
| `chat` | Community chat messages |

### Admin SDK Scripts (local)

- **Location:** `/Users/nathantempleton/Downloads/SMAC Platform 2026 Files/firebase-email-update`
- **Service account:** `smac-2026-firebase-adminsdk-fbsvc-a61b3c397f.json`
- **Runtime:** Node.js

---

## Key Technical Patterns & Gotchas

### `registryId` vs. `uid`

Make.com creates `smac_registry` docs with random Firestore doc IDs (not Firebase Auth UIDs). Therefore:

- `currentUser.registryId` = Firestore doc ID (used for all `smac_registry` reads/writes)
- `currentUser.uid` = Firebase Auth UID (used for `submissions`, `engagements`, `trackers` queries)

These are **not the same**. `_photoCache` must always be written under **both** keys. `primePhotoCache` and `renderMemberGrid` do this. `avatarHTML` should always be called with `m.id` (doc ID) as the `uid` arg for registry members.

A self-healing UID write occurs on login — if `smac_registry` doc is missing `uid`, it is written automatically.

### `weekIdx` is 0-indexed

`weekIdx: 0` = Week 1, `weekIdx: 2` = Week 3. Important for debugging and audit scripts.

### Single-file risk

Because the platform is a single `index.html`, copying from uploads can overwrite working files mid-session. Always re-verify and re-apply prior session fixes before layering new changes. Start each session by checking whether the project file or the outputs file contains the most recent changes.

### Firebase Auth vs. Firestore

Separate systems. Email/UID changes must be synced manually to `smac_registry`; a self-healing UID write occurs on login.

### Browser CORS

Direct Anthropic API calls from the browser are blocked by CORS. Always route through the Cloudflare Worker proxy.

### Round Transition Checklist (new — June 1, 2026)

When `CURRENT_ROUND` advances to a new round key:
1. Run `arrayUnion(newRound)` on all returning members' `smac_registry` docs (console script or admin tool)
2. New signups are handled automatically by Make.com
3. Non-renewers: remove new round key via admin Directory panel
4. Run Archive Round tool to lock prior round scores into `lifetimePoints` and zero `points`
5. Update login badge and dashboard welcome line to new round label

---

## Session Log (continued)

### May 31, 2026 — Round 2 Feedback Card

**Dashboard Feedback Card**

- Added a new feedback card directly beneath the `#dash-renew-card` (Round 3 renewal) on the Dashboard
- Title: "💬 Leave Feedback on SMAC Round 2"
- Body copy invites Round 2 wrap-up feedback (what worked, what didn't)
- CTA: "Leave Feedback" button linking to https://joinsmac.com/feedback (`target="_blank"`, `rel="noopener"`)
- Built as an `<a>` tag reusing the existing `.dash-view-all-btn` class (matches gold hover state); `text-decoration:none` to suppress default underline
- `animation-delay` set to `0.175s` to slot between the renewal card (`0.17s`) and zoom card wrap (`0.18s`)
- No new JS functions added — direct link, no duplicate-name risk

### May 25, 2026 — Spot Countdown + Admin Seats Editor

**Spot Countdown Component**

- Added `.spot-countdown` CSS component (pulsing red dot + "N of 50 Spots Remaining" label + gold fill progress bar)
- `applySpotCountdowns()` function uses `document.querySelectorAll('.spot-countdown')` — all instances update from one call
- `SPOTS_LEFT = 25` / `SPOTS_TOTAL = 50` JS constants serve as the hardcoded fallback
- Component renders in two places: Dashboard renewal card + Renew modal

**Dashboard Card Repositioned**

- `#dash-renew-card` moved from bottom of dashboard (after leaderboard) to directly below `#dash-snapshot-banner`
- New render order: status pills → Zoom card → Snapshot banner → **Round 3 renewal card** → stats grid → quick actions → ...
- `animation-delay` updated from `0.72s` to `0.22s` to match new position
- Spot countdown bar renders inside the card above the body copy

**Renew Modal**

- Spot countdown bar added above the "Registration closes in" timer block
- `applySpotCountdowns()` called on `openRenewModal()` so the bar always reflects the latest value when the modal opens

**Admin Seats Editor** (`#admin-seats-tool`)

- New admin-only card in Reports page (shown/hidden alongside other admin tools)
- Controls: − / + stepper buttons + number input (0–50) + live mini progress bar preview showing % claimed
- "Save Spot Count" button writes `{ spots_left: n, updated_at: Date.now() }` to `app_config/r3_seats` Firestore doc
- On save: `SPOTS_LEFT` updated in memory, `applySpotCountdowns()` re-runs, success toast displays for 3.5s
- `loadSeatsEditor()` called on admin login — reads `app_config/r3_seats`, syncs `SPOTS_LEFT`, populates input
- Dashboard load (all users): reads `app_config/r3_seats` before calling `applySpotCountdowns()` so live value is always shown
- Firestore doc: `app_config/r3_seats` → `{ spots_left: number, updated_at: timestamp }`

**Key functions added:** `applySpotCountdowns()`, `loadSeatsEditor()`, `adminSeatsDelta(delta)`, `saveSeatsToFirestore()`, `_renderSeatsPreview(n)`

---

### May 21, 2026 — Points Reconciliation + Sweep Tool + Zoom Card Move

**Points Integrity Audit**
- Audited the full points pipeline: constants, preview, submission, edit, deletion, and all display locations
- Identified two root causes of perceived mismatch:
  - `PTS_ENGAGEMENT` constant (2) was not being used in the engagement submit path — raw `2` was hardcoded instead
  - Registry `increment()` can fail silently on network blip, leaving stored total lower than sum of docs
- Both issues addressed: constant wired in; reconciliation system added

**Points Reconciliation System**
- `runPointsReconciliation(uid, registryId, autoHeal)` — see Points System section above
- Called automatically on every profile page load (member-only, non-blocking)
- Admin "🔍 Check Points" button added to Submissions Viewer

**Points Integrity Sweep**
- `runPointsSweep()` — 3 Firestore reads, evaluates all members
- `fixAllMismatches()` — batch heal button

**Zoom Card Repositioned**
- Moved from below quick action buttons to between status pills and stats grid
- Now renders in position 3 of the dashboard render order (see Points System section)

---

### May 19, 2026 — Go Live Alternative + Zoom Card Fix

**Weekly Challenge Modifier — Go Live alternative (Week 11)**
- "Go Live" requires 1K+ followers to unlock Instagram Live
- `WEEKLY_CHALLENGES[10].desc` updated (this week only) to include an alternative path for sub-1K members: record a 3–5 min on-camera video talking directly to your audience and post it as a Reel or Story
- Single card, single toggle, same +5 pts — no UI or logic changes needed

**Zoom Card — `safeUrl` protocol fix**
- `buildZoomCardHTML()` previously only escaped quotes on the stored URL; a bare URL like `calendar.app.google/wBdP4...` was treated as a relative path, breaking the link
- Fixed: `rawUrl` is trimmed first; `safeUrl` prepends `https://` if the value doesn't already start with `http://` or `https://`

---

### May 9, 2026 — Pro Dashboard Rebuild + Chart Fix

Rebuilt the PRO page from a static vertical scroll of tool forms into a proper dashboard with a card grid and sub-view tool navigation.

**Architecture change**
- `page-pro` is now a shell with `<div id="pro-dashboard-root">` (JS-rendered) and `<div id="pro-tool-templates">` (hidden form cards cloned into tool view)
- `renderProPage()` calls `renderProDashboard()` on every nav
- `renderProDashboard()` — dashboard state: stats, chart, tool grid
- `renderProTool(toolId)` — tool state: back nav + full tool form
- Scroll resets to top on every state transition

**Dashboard view**
- Header: "SMAC PRO" (Bebas Neue, gold) + week label + tagline
- Trial banner rendered in JS if `userHasTrial()` — no longer a static DOM element
- Stats row (2 cards): Total Points (count-up animation, live from `smac_registry`) + Posts This Week vs. Pro target (fraction + filled/empty pip row)
- Posting History chart: 12 CSS bars (one per week), current week gold, past weeks muted gold, future weeks surface color; count labels above bars; month labels (March/April/May) below; 6px minimum bar height so structure always visible
- Pro Tools grid: 2-column, 7 cards — 4 live (gold border, tappable, "Open →"), 3 coming-soon (opacity 0.45, "Coming Soon" pill)

**Tool view**
- Back arrow + "Pro Dashboard" label calls `renderProDashboard()`
- Tool icon + name as header
- Full tool form HTML rendered below (identical to previous inline forms)
- WAP: `wapPrefillFromProfile()` and `loadWapHistory()` called via `setTimeout` after render

**New constants**
- `PRO_WEEK_TARGETS = [3,3,3,3, 4,4,4,4, 5,5,5,5]` — Month 1: 3/wk, Month 2: 4/wk, Month 3: 5/wk
- `PRO_TOOLS` array — tool metadata (id, icon, name, desc, live flag) used by both grid and tool view header

**Data fetched on every `renderProDashboard()` call**
- `smac_registry/{registryId}` — total points
- `submissions` (where uid == currentUser.uid) — posts this week + weekly counts for chart

**Chart fix**
- Bars now use `min-height: 6px` so the 12-bar skeleton is always visible even at 0 posts (previously bars collapsed to 0 height)

---

### May 9, 2026 — Round Config System + Pro Chart Fix

**Pro Dashboard — Posting History round scoping (bug fix)**
- Chart was pulling all submissions with no round boundary; Round 2 posts appeared in the Round 3 Pro chart
- `weekCounts` now filters `subs` to `ts >= WEEK_SCHEDULE[0][0] && ts <= WEEK_SCHEDULE[11][1]` before bucketing by `weekIdx`
- "Posts This Week" card received the same fix — filters by both `weekIdx` and the week's timestamp bounds

**Multi-round config system (`ROUND_CONFIGS`)**
- Replaced static `CURRENT_ROUND`, `WEEK_SCHEDULE`, `WEEKS`, `MONTHS`, `MONTH_REQS` with a single `ROUND_CONFIGS` object keyed by round ID
- Each entry: `weeks` (12 `[startUTC, endUTC]` pairs), `weekDefs` (id, label, dates, month, required), `months`, `monthReqs`
- `_resolveActiveRound()` IIFE auto-detects the active round by matching `Date.now()` against each schedule; sets all globals automatically
- Falls back to most recent past round if between rounds so the app never goes blank
- `window._NO_ACTIVE_ROUND = true` flag set when no round matches; triggers admin red banner and `console.warn`
- Admin banner text: "⚠️ No active round detected — add the next round config to ROUND_CONFIGS in the source file."

**Rounds pre-loaded**
- R2: March–May 2026 (existing schedule, W12 end patch removed)
- R3: June–August 2026 (EDT UTC-4 throughout)
- R4: September–November 2026 (EDT through Oct 31; DST ends Nov 1 2am — W9 straddles transition, W10–W12 use EST UTC-5)
- Placeholder comment `// R1_2027:` marks the Dec 1 reset point

**To add a future round:** expand the `R1_2027` placeholder in `ROUND_CONFIGS`. No other changes needed.

---

### May 6, 2026 — Cloudflare Worker Proxy

- Cloudflare Worker (`smac-ai-proxy`) created to proxy Anthropic API calls
- Worker URL: `https://smac-ai-proxy.templetonimage.workers.dev`
- API key stored as Cloudflare secret `ANTHROPIC_KEY`
- All four AI feature fetch calls updated to point to Worker URL
- `_ant1`/`_ant2`/`ANTHROPIC_KEY` constants removed from `index.html`
- Worker injects required Anthropic headers server-side

---

### April 1, 2026 — Show Your Face (SYF) Modifier

**Feature:** Show Your Face Modifier — awards +5 pts for on-camera video content. Stacks with format bonuses.

**Rules:** One SYF per member per Challenge Week. Mutually exclusive with Weekly Challenge Modifier.

**Date gate:** Hidden until `SYF_UNLOCK_TS = new Date("2026-04-01T04:00:00Z").getTime()`.

**New Firestore field:** `syfApplied: true/false` on every `submissions` doc.

**Surfaces:** Submit page, points preview, Admin Submissions Viewer, Member Submissions Log.

**Functions added:** `renderSYFModifier()`, `toggleSYFModifier()`

---

### March 22, 2026 — Profile Photo System

- Firebase Storage enabled on `smac-2026`
- Photos stored at `profile_photos/{uid}.jpg`
- Auth-only read/write rules, 2MB cap, image content type enforced
- `primePhotoCache()` timing fix — re-renders topnav and active page after async fetch
- `_photoCache` keyed by Auth UID; cache also written under `registryId` for Make.com-created docs
- `avatarHTML()` always called with `m.uid` (not doc ID) for registry members

---

### March 19, 2026 — SMAC Expansion Strategy

- Pro launch timeline moved to Round 3
- Brand positioning statements finalized
- Show Your Face camera feature planned
- Content Performance Analysis feature planned
- Formal graduation path confirmed

---

### March 18, 2026 — SMAC Pro Architecture

- Pro data model added (`isPro`, `proSince`, `proExpiry`, `trialUntil`)
- `userHasPro()` helper implemented
- PRO page scaffold built (6 sections, all coming-soon at time)
- Bottom nav PRO button + topnav PRO badge
- Admin Directory per-member Pro controls
- Launch control flags: `_PRO_GLOBAL_ACTIVE`, `_PRO_NOTIFS_ACTIVE`

---

### March 16, 2026 — Platform Session

- Streak bonus removed
- Engagement Viewer added to Admin Reports
- All-Star Progress table
- URL linkify bug fixed
- Member self-service: edit & delete own feed posts
- Member self-service: My Post Submissions and My Engagement Log cards
- Announcement collapsible expand/collapse
- Feed compose box repositioned above announcements
