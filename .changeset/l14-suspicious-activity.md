---
'@cogenta/auth': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Surface repeated failed sign-ins instead of only slowing them down (L14 task 4)

`cogenta_login_attempts` has been written to on every failed sign-in since L2
and read by nothing but the rate limiter's own counter. A site being
brute-forced knew it and told nobody. It now says so, in two places.

- `@cogenta/auth`'s `RateLimiter` gains `recentFailures()`, which groups the
  attempts still inside the backoff window by subject, worst first. It also
  **prunes** what has fallen out of the window — a real leak, since `clear()`
  only runs after a *successful* sign-in, so a subject that never succeeds
  accumulated rows for ever, which is exactly the case that grows fastest.
- `@cogenta/api` gains `createSuspiciousActivitySource`, one more `NoticeSource`
  in the array `serve.ts` already builds. It shows an admin — and only an
  admin — how many failures across how many accounts, and is not dismissible
  because it disappears on its own within the limiter's fifteen-minute window.
- `cogenta serve` also sends a `security.suspicious_activity` alert through the
  signed webhook channel L14 task 1 connected, built with `@cogenta/channels`'s
  own `buildAlert` — no second notification path and no second signature. At
  most one alert per five minutes, so a script making hundreds of attempts does
  not become hundreds of outbound requests.

**Counts only, never the accounts.** Neither the notice nor the outbound alert
names an email: that would turn an admin screen into an account-enumeration
surface, and the numbers are what a decision is made on. Per-subject detail
stays in the audit log, behind its own permission.

The rate limiter itself was audited before anything was added and needed
nothing: password sign-in, TOTP sign-in and TOTP enrolment all go through it,
WebAuthn is deliberately exempt (there is no guessable secret), and password
reset has no HTTP route at all.
