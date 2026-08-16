---
'@cogenta/core': minor
'@cogenta/auth': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

The other half of password reset (`.changeset/auth-password-reset.md`,
L13 task 6): that changeset built the store and the terminal command and
said plainly "no admin route can receive a reset click yet". This is that
route, and the screen behind it.

`@cogenta/auth`'s `AuthStore` gains a `resets` field — the
`PasswordResetStore` `createPasswordResetStore` already built, now wired
into the object every caller already holds, the same way `rateLimit` and
`sessions` are.

`@cogenta/api`'s `createAuthRouter` gains two routes. `POST
/api/auth/forgot-password` accepts an email and answers with the **exact
same response** whether or not an account exists for it — the line this
route exists to never cross is account enumeration, and every branch of its
handler (an existing account, a disabled one, a non-existent one) returns
byte-identical bodies. It rate-limits by the submitted email, before the
account lookup, on the same subject either way, the same posture
`loginAttempts` already applies to a wrong password. Only a real, active
account gets a token issued, delivered through a new optional
`onForgotPassword` callback rather than a hard dependency on
`@cogenta/channels` (R9) — the router itself never sends mail. `POST
/api/auth/reset-password` redeems the token, sets the new password (same
12-character floor as the self-service password-change route, now shared
from a new `password-policy.ts` instead of duplicated), and revokes every
existing session, exactly like `cogenta users reset-password --token`
already does. A new error code, `AUTH_RESET_TOKEN_INVALID` (400), names an
invalid, expired or already-used token — unlike `forgot-password`, this
route's refusal is allowed to say why, since the secret here is the token
itself, not whether an email exists.

`@cogenta/cli` factors the mail-sending half of `cogenta users
reset-password --email` out of `commands/users.ts` into a new shared
`reset-mail.ts`, so `cogenta serve` can wire the identical wording (now with
an optional link to the admin's reset screen instead of the terminal
command) into `onForgotPassword` without a second copy of it. `runServe`
passes it to `createAuthRouter` unconditionally: the token is still issued
and thrown away unsent when no site's mail is configured to go anywhere
useful, since the HTTP response must never depend on whether the mail could
be delivered.

`@cogenta/admin` (private, no changeset) gains the two screens this needed:
"forgot password" on `/forgot-password`, linked from the sign-in screen, and
"reset password" on `/reset-password?token=…`, the link the mail sends. Both
are public routes, like `/login`. The user-management screen's role editor
also moves off a raw comma-separated text field: four standard role names
(`admin`/`editor`/`author`/`contributor`) are now offered as checkboxes,
alongside any role a site's accounts already use, plus a free-text field for
a role of the site's own — a UX convention only, not a contract A change
(a role is still an arbitrary string as far as the server and the five
permission actions are concerned).
