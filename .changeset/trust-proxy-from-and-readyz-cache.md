---
'@cogenta/core': patch
'@cogenta/cli': patch
'@cogenta/api': patch
---

Narrow what a reverse-proxy setting trusts, and protect the unauthenticated probe.

- New `security.trustProxyFrom` (env `COGENTA_TRUST_PROXY_FROM`, comma-separated): the addresses or CIDR blocks, IPv4 or IPv6, the proxies connect from. With `security.trustProxy` on, the forwarded header is honoured only when the socket address is inside one of them (an IPv4-mapped IPv6 socket address such as `::ffff:10.0.0.7` matches its IPv4 block); a caller that reaches the server directly is attributed to its own address. An entry that is not an address or a valid CIDR is refused at start-up. When `trustProxy` is on and the list is empty, `cogenta serve` logs one warning at start-up: the header can be spoofed by anything that reaches the pod without going through the proxy.
- `GET /readyz` shares one in-flight database check between concurrent probes, reuses its answer for one second, and logs only when the state changes (failed, recovered) instead of on every probe.
- `cogenta users create` refuses a first password shorter than the sign-in floor (`assertPasswordPolicy`, now exported from `@cogenta/api`) before anything is written, without echoing it. The same check guards `COGENTA_ADMIN_PASSWORD` in the container's bootstrap.
