---
"@cogenta/core": patch
"@cogenta/cli": patch
---

The in-process rate limiter no longer keeps every key it has ever seen: expired buckets are swept as it runs and the number of live buckets is capped (`maxKeys`, 100 000 by default). `POST /_cogenta/unlock` now spends an address-wide budget before any per-entry one and never creates a counter for an id that cannot name an entry, so naming a new entry on every guess no longer escapes the ceiling or grows memory.
