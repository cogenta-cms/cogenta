---
"@cogenta/auth": patch
---

A sign-in with an email longer than 254 characters is refused as any wrong credential before it is counted or journalled, the audit log keeps at most 64 KiB of a diff (a marker records how much was dropped, the hash chain stays valid), and the login-attempt limiter sweeps rows that left its window on write instead of only when someone reads the failures.
