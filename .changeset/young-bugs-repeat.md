---
'@cogenta/core': minor
---

Add the Redis cache driver, as the optimal tier.

`@redis/client` is an **optional peer dependency**, loaded through a dynamic import. A
site that does not want Redis never installs it, `pnpm install` stays free of runtime
dependencies, and the registry simply falls through to the file driver when the package
or the server is absent. The published type declarations do not reference it either: the
driver describes the slice of the client API it uses structurally.

Keys are namespaced, and `clear()` walks them with `SCAN` rather than `FLUSHDB` — the
Redis instance may be serving other things, and a cache driver that wipes someone else's
data is an incident, not a clear. Expiry is written as `PX` so Redis can reclaim memory
on its own clock, but the authoritative check stays on read, which is what keeps this
driver's behaviour identical to the others.
