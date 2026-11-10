# Verification record

- `npm test`: 150 passing tests, Node built-in runner. HTTP tests bind ephemeral loopback ports; environments that prohibit listening need local-network permission.
- `npm run check`: JavaScript syntax, local links, label/ARIA references, CSP-compatible markup, API import, exact dependency lock, deployment configuration, and original asset hashes pass.
- `git diff --check`: no whitespace errors. No commits or deployments were performed.

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

## External boundary

An actual private Vercel Blob store was not provisioned or written to. The API is tested with injected storage at the SDK boundary. Connect a private store and configure its server-only token using README.md before receiving real feedback. No public read endpoint exists.
