---
'@cogenta/auth': patch
---

The sign-in limiter now announces the real wait. A refused attempt used to report a fixed delay (1 s to 15 min by attempt count) while the block lasted until enough attempts left the 15-minute window; `retryAfterMs` (and the `Retry-After` header built from it) is now the time until the subject would be allowed again, counted from the attempt that must age out. For an account guessed at from several addresses, it is the later of the address and account waits.
