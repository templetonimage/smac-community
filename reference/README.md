# SMAC security reference (Oct 2026)

Not deployed from here. Reference copies for porting the SMAC security sweep to WAC and AAC.

- `../firestore.rules`, `../storage.rules`, `../test/` — published SMAC rules + emulator tests (CI: `.github/workflows/rules-test.yml`)
- `worker/smac-ai-proxy.js` — Cloudflare Worker that verifies Firebase ID tokens; `worker/worker.test.mjs` (run: `node --test worker.test.mjs` next to a copy named `index.js`)
- `functions/security-additions.js` — `createMemberAccount` callable + private-phone `getOptedInMembers()`; tests `cma.test.cjs`, `sms.test.cjs` (fake Admin SDK, real firebase-functions)
- App changes: PRs #3–#8 on `main` (`safeHref`, `jsq`, CSP, Create Member Account callable, `smac_private`, `_aiHeaders`, plan-history fix)
- `functions/stripeWebhook-secure.js` + `functions/webhook.test.cjs` — Stripe webhook: lookup by payment AND login email, never overwrite an existing registry doc (`create()` + MANUAL REVIEW log), welcome email with set-password link instead of a password
- App PRs #9 (chat stops storing `authorEmail`, `authorIsAdmin` badge) and #10 (Chart.js SRI); marketing repo `templetonimage/smac` PR #1 (feedback form honeypot + timing guard)
