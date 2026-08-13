---
'@cogenta/admin': minor
---

Wire the admin SPA to `cogenta serve`'s auth backend (L2 task 2): a password-then-TOTP
login screen, a route guard on every page but `/login`, and a signed-in header showing
the current user with sign-out.

The bearer token from `/api/auth/login` lives in `localStorage` and is checked against
`/api/auth/session` on load — a token the server no longer recognises (expired, revoked,
never valid) is discarded rather than trusted, and the visitor lands back on `/login`
remembering where they were headed.

Passkeys are the spec's primary method ("passkeys en méthode principale, mot de passe
plus TOTP en secours") but need a challenge held between two requests the backend does
not expose yet — this ships the fallback path first, since it has no such dependency,
and passkeys land alongside task 3.
