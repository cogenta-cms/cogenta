---
"@cogenta/cli": patch
---

Content a plugin writes, publishes or trashes now goes through the site's own stores, so it reaches the search and vector indexes, redirect tracking and webhooks like an editor's change, and each write is recorded in the audit log as `plugin:<name>`.
