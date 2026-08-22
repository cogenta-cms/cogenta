---
"@cogenta/cli": patch
---

Fix: a `collectionList` block linking to an entry whose routed collection has
no slug (a `slug`-kind field is not `required` by contract A — a draft
published without one is real, reachable content) used to make `buildPath`
throw straight through `renderPage`, turning one incomplete entry into a 500
for every visitor of the page listing it. `link()` now degrades an
unresolvable route to `href="#"`, the same fallback already used when the
target was never fetched at all — one broken linked entry no longer takes
down the whole page.

Also: a refused `POST /api/auth/login` (wrong password or unknown account)
is now journalled as `auth.login_failed` (actor `null`, attempted email kept
on the entry), matching the intrusion-detection signal every other CMS's
security tooling logs and that this audit trail was missing until now. Only
the password step records this — TOTP, recovery-code and passkey completion
reuse the same error codes for a different meaning each time, so recording
those under the same generic action would misname what actually failed.
