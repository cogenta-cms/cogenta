---
'@cogenta/core': minor
---

Add the cache drivers: `memory` and `file`, plus their single contract suite.

`invalidateTags` is mandatory in every implementation, servers or not — content caching
is only correct if publishing can drop every page that embedded the changed content, and
bolting that on later would mean rewriting each driver.

Values round-trip through serialisation in `memory` too, not just on disk, so a caller
cannot mutate the cache by keeping the reference on one driver and not on another. Both
drivers run the same contract file, which is what makes them substitutable rather than
merely similar.

The `file` driver hashes keys into filenames rather than escaping them, writes through a
uniquely named temporary file and an atomic rename, and retries the rename on the EPERM
and EBUSY that Windows returns when another handle holds the target. A corrupted entry
reads as a miss: a cache that throws is worse than a cache that forgets.
