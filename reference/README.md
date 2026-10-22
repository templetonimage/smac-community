# SMAC security reference (Oct 2026)

Not deployed from here. Reference copies for porting the SMAC security sweep to WAC and AAC.

- `../firestore.rules`, `../storage.rules`, `../test/` — published SMAC rules + emulator tests (CI: `.github/workflows/rules-test.yml`)
- `worker/smac-ai-proxy.js` — Cloudflare Worker that verifies Firebase ID tokens; `worker/worker.test.mjs` (run: `node --test worker.test.mjs` next to a copy named `index.js`)
- `functions/security-additions.js` — `createMemberAccount` callable + private-phone `getOptedInMembers()`; tests `cma.test.cjs`, `sms.test.cjs` (fake Admin SDK, real firebase-functions)
- App changes: PRs #3–#8 on `main` (`safeHref`, `jsq`, CSP, Create Member Account callable, `smac_private`, `_aiHeaders`, plan-history fix)
