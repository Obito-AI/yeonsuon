# Verification record

- `npm test`: 150 passing tests, Node built-in runner. HTTP tests bind ephemeral loopback ports; environments that prohibit listening need local-network permission.
- `npm run check`: JavaScript syntax, local links, label/ARIA references, CSP-compatible markup, API import, exact dependency lock, deployment configuration, and original asset hashes pass.
- `git diff --check`: no whitespace errors.

## Test-first evidence

Content tests failed before the page/config existed. API and client tests failed against missing/stub implementations before implementation. Real HTTP tests initially failed against a 501 server stub. Browser review found a malformed school option; a regression test failed before the markup fix. Accessibility regression tests failed before the contrast, control-size, landmark and accessible-name fixes.

## Isolated Chromium checks

Used a temporary browser profile and test-only tools outside the repository; no signed-in browser data or real feedback writes were used.

- Visually inspected desktop and mobile screenshots. Viewports 1440, 768, 390 and 320 px have no document-level horizontal overflow. The clipped off-screen honeypot is intentionally outside normal layout.
- No page JavaScript exceptions.
- Keyboard skip link reaches the main content.
- Original tutorial plays; measured duration 232.356 seconds, no media error.
- Missing recommendation blocks submission; zero is preserved as a valid score.
- Pending submission disables controls and prevents duplicate submission.
- Synthetic server failure preserves answers; unavailable clipboard exposes manual copy without contact or interview consent.
- Revoking interview consent clears and disables contact.
- Confirmed synthetic success resets the form, contact and copy fallback.
- JavaScript-disabled browsing leaves submit disabled and displays the explanatory notice.
- axe-core checks for WCAG 2 A/AA, WCAG 2.1 A/AA and best practices report zero violations at 1440, 390 and 320 px. Text entry controls are 16 px. Automated checks supplement, and do not replace, a full assistive-technology audit.

## Production release

- GitHub: `https://github.com/Obito-AI/yeonsuon` (public, `main`)
- Vercel Production: `https://yeonsuon.vercel.app`
- Deployment: `dpl_7z5cetJjTfAiAwqLow1Jxi4R8h1Z`, READY
- Deployment protection was disabled for this public project and the live page returned HTTP 200 without authentication.
- The live HTML contained the expected hero and feedback form.
- The live download SHA-256 was `cba2455755fe2344b4d020cbe2f0c24b6bce12d3c125bd1265e097a7582ed0df`.
- A live byte-range request returned the expected 1,024 video bytes, confirming browser-seek delivery.
- `GET /api/feedback` returned 405 and exposed no records.

## Feedback storage verification

- Private Vercel Blob store: `yeonsuon-feedback` (`store_kkuddR1E2BQHCkKT`), connected by OIDC to Production, Preview and Development.
- A real production POST returned `201 {"ok":true}`.
- The exact private JSON record was read back with a server-generated UUID pathname and matched the submitted normalized test values.
- Contact, IP, User-Agent, honeypot and provider details were absent from the stored test record.
- The test record was deleted after verification; a final store listing returned zero blobs.
- No public feedback read endpoint exists.

## Live browser verification

- Headless Chrome loaded the public production URL at desktop 1440 px and mobile 390 px.
- Both rendered the expected title, hero, one tutorial video and one feedback form.
- Full-page screenshots showed no release-blocking clipping, horizontal overflow, broken sections or form layout failures.
