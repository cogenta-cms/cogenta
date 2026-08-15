---
'@cogenta/auth': minor
'@cogenta/cli': minor
---

Password reset, absent until now (L13 task 6). A person who forgot their
password had no way back: `users create` was the only account command, so
the recovery procedure was "have an administrator make you a second
account".

`@cogenta/auth` gains `createPasswordResetStore`, backed by a new
`cogenta_password_resets` table that `ensureAuthTables` creates like the
others. A token is 32 random bytes stored only as a SHA-256 hash — a leaked
table hands out nothing live, the same posture as a session token — bound to
one user, valid 30 minutes, and usable exactly once. Single use is enforced
by `update ... where used_at is null` reporting `rowsAffected`, so two
simultaneous redemptions produce one `ready` and one `used`, not two
successes. Issuing a second reset deletes the first: a person who asks again
because the mail never arrived must not leave two working links behind.

The token is deliberately **not** a signed payload. A signature can be
checked without touching the database, and that is precisely what must not
happen — single use and revocation are properties of a row, and an
already-used token still carries a perfectly valid signature.

`@cogenta/cli` gains `cogenta users reset-password`, in two halves:
`--email <address>` issues a token and mails it; `--token <token>
[--password <text>]` redeems it, replaces the password, and revokes every
session the user had. That last step is why the CLI composes the stores
rather than calling one: a reset that leaves whoever knew the old password
signed in has reset nothing.

The mail goes through `@cogenta/channels`'s existing email adapter — a new
workspace dependency of `@cogenta/cli`, and the project's one way out for
mail rather than a second mailer. Its only transport is the local file one
(a real SMTP transport remains a documented gap in that package), so the
command writes a real message to `.cogenta/mail` and says so in as many
words instead of pretending anything was posted. Because the token never
appears on the terminal, the mail is the only place it exists.

Since no admin route can receive a reset click yet (that lands with L11),
the message carries the token and the exact command rather than a link that
would 404 today.
