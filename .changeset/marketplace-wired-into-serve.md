---
'@cogenta/cli': minor
---

Mounts L17's marketplace router (`@cogenta/api`'s `createMarketplaceRouter`,
`@cogenta/plugins`' catalog and installer) into `cogenta serve` at
`/api/marketplace/*`. Admin-only, same as every other route that installs or
runs code. The catalog is local/embedded and empty by default — no site
configures a distant registry yet, since that would need L13's API keys,
which were never built.

`@cogenta/cli` gains a new dependency on `@cogenta/plugins` (workspace).
