---
"@cogenta/agents": patch
---

`redirects.create` accepts an `isLivePath` check and refuses (`REDIRECT_FROM_LIVE_PATH`) to redirect a path where a published page answers, since a redirect is applied before routing and would take the page down.
