---
'@cogenta/core': minor
---

Add the storage driver interface, the `local` implementation and their contract suite.

Object keys are validated against a whitelist of allowed characters per segment rather
than a blacklist of dangerous ones — keys arrive from uploads, imports and plugins, and
a blacklist loses to URL encoding, backslashes and Unicode look-alikes. Every operation
validates, so a traversal attempt raises instead of quietly reporting "not found".

The `local` driver keeps objects and their metadata in two parallel trees. Storing the
metadata next to the object would make it addressable as an object itself: readable
under a guessable key, overwritable through a forged one, and colliding with any key
that happened to end in the sidecar suffix.

Signed URLs are HMAC-signed and verified in constant time. Without
`COGENTA_STORAGE_SIGNING_KEY` the driver generates a per-process key and says so through
`health()`, rather than silently issuing URLs that stop working after a restart.

`StorageDriver` also gains `head()`: the content type is supplied by the caller and
cannot be recovered later, so an interface with no way to read it back would lose it.
