---
"@cogenta/api": patch
---

The unlock proof of a password-protected page carries a keyed marker of the stored password hash: `UnlockTokenService.issue` and `accepts` take the current marker (`stampOf(lockDigest)`), so a cookie earned with a password that has since been changed no longer opens the page. Cookies issued before this release are refused once.
