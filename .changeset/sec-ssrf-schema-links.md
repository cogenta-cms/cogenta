---
"@cogenta/schema": patch
---

The link checker no longer probes the server's own network: an external link is resolved first, a loopback, private, link-local or otherwise non-public target is reported as the new `blocked_target` reason and never requested, redirects are followed by hand and judged hop by hop, requests go to the validated address, and response bodies are cancelled unread. `checkLinks` gains `allowPrivateTargets` (off by default, for tests or a development site only).
