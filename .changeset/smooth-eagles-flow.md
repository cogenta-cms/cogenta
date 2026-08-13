---
'@cogenta/core': minor
---

Add `auth.signingKey` to the resolved configuration, read from
`COGENTA_AUTH_SIGNING_KEY` — the key `@cogenta/auth`'s login ticket needs, and a real
secret rather than a config-file field (rule R7): there is no `auth` section in the input
schema at all, so writing one in `cogenta.config.ts` is rejected as an unrecognised key,
not merely a forbidden one.
