---
'@cogenta/cli': patch
---

Fix `/admin` rendering a blank page. Vite always trails its build `base`
with `/` ("/admin/"), and react-router's `basename` match is a literal
string prefix — a request for exactly `/admin` (no trailing slash, the URL
a real user actually types or gets redirected to first) does not start
with "/admin/", so the router silently rendered nothing. Confirmed via the
browser console: `<Router basename="/admin/"> is not able to match the URL
"/admin"...`. `/admin/` (with the slash) always worked, which is why this
was easy to miss testing via curl/HTTP status codes alone — a 200 response
doesn't mean the page actually rendered.

Fixed by stripping the trailing slash from the basename `@cogenta/admin`'s
`app.tsx` passes to `BrowserRouter` — "/admin" still matches
"/admin/collections" (still starts with "/admin"), so nothing about deep
links changes. Verified with a real browser: login → TOTP setup → a
working dashboard with real site health and audit-log data, both starting
from `/admin` with no trailing slash.
