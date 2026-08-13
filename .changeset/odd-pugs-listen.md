---
'@cogenta/core': minor
---

Add the structured logger.

`createLogger` emits one JSON object per line — never free text — with a level, an ISO
timestamp, a message and the caller's fields merged at the top level. Fields cannot
overwrite the record structure. `child()` binds context that repeats on every record
without touching its parent.

Every record passes through redaction on the way out: by field name (`apiKey`,
`secretAccessKey`, `authorization`), by value shape (provider key prefixes, private key
blocks, JWTs) and inside connection strings, where only the password is replaced so the
URL stays readable for debugging. Fields that merely look related — `tokens`,
`tokensPerDay`, `cacheKey` — are left alone, because over-redacting makes logs useless.

`Error` values are unpacked explicitly rather than left to `JSON.stringify`, which
renders them as `{}`, and an unserialisable field drops the field rather than throwing
in the caller's face.
