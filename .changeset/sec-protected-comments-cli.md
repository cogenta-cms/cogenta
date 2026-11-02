---
"@cogenta/cli": patch
---

A password-protected page no longer shows its approved comments or the comment form while locked, the "recent comments" widget skips comments on any page that is not public, and `POST /api/comments` answers 404 for a private page or a protected page the visitor has not opened.
