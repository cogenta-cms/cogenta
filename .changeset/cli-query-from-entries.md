---
"@cogenta/cli": patch
---

Request query strings are parsed with `Object.fromEntries`, so no query key can reach an object prototype.
