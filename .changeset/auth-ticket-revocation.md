---
"@cogenta/auth": patch
"@cogenta/api": patch
"@cogenta/cli": patch
---

A second-factor sign-in ticket or passkey-registration ticket issued with an old password no longer survives a password reset, a voluntary password change, `cogenta users reset-password --token`, an account being disabled or anonymized: the new `AuthService.revokeSignInTickets(userId)` (and the standalone `revokeSignInTickets(db, userId)`) voids every ticket the account has in flight, so revoking the sessions can no longer be undone with a ticket and a valid code.
