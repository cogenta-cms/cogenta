---
"@cogenta/auth": patch
---

New password hashes use scrypt `N=2^15, r=8, p=3` (the OWASP profile with the same 32 MiB of memory as before and three times the CPU) instead of `p=1`, and the comment that called `p=1` the OWASP minimum is corrected. Hashes already stored keep verifying with the parameters they carry, and `CredentialStore.verifyPassword` upgrades one to the current parameters after a successful verification (`needsRehash`). Expect a password check to take roughly three times longer; recovery codes are hashed the same way.
