---
"@cogenta/import": patch
---

The WordPress import's SSRF guard now classifies IPv4 and IPv6 addresses by their bytes against explicit ranges (loopback, private, carrier-grade NAT, link-local `fe80::/10`, unique-local, site-local, multicast, unspecified, documentation and benchmarking blocks, IPv4-mapped, NAT64 and 6to4 judged by their embedded IPv4 address) instead of text prefixes, and connects to the address it validated (`resolvePublicTarget` + `createPinnedFetch`, keeping the original host name for `Host`, SNI and certificate checks) so a DNS answer that changes between the check and the connection no longer bypasses it. Every redirect hop is re-resolved and re-pinned.
