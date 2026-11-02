---
"@cogenta/core": patch
"@cogenta/agents": patch
"@cogenta/cli": patch
---

The agent `http.fetch` tool keeps the site's own configured origin (scheme, host and port, exactly) reachable even on a loopback or private address, through a new `trustedOrigins` option set from `config.site.url` by `cogenta serve`; every other non-public address is still refused. `resolvePublicTarget` and `fetchPublicOnce` gain an `allowPrivate` option for a caller that vouches for one exact URL.
