---
"@cogenta/cli": patch
---

`cogenta serve` passes the visitor's unlock proof to the content layer per entry, so a protected page renders its content only after a valid unlock cookie for that very entry (a proof for one page never opens another, and a cookie never widens an API read), and a plugin's `content.read` no longer returns private or password-protected entries.
