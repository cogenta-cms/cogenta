---
'create-cogenta': patch
---

The installer's recap now tells you where to actually sign in: "Then open
<site-url>/admin and sign in with the admin account above." Previously it
only mentioned enrolling a passkey, with no mention of a URL — a real
onboarding blocker once `cogenta serve` gained the ability to serve the
admin SPA (see `@cogenta/cli`'s own changeset).
