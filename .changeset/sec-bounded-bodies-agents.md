---
"@cogenta/agents": patch
---

The `http.fetch` tool reads at most about 400 KB of a response and cancels the transfer there, applies a body timeout, and stops when the run is cancelled, instead of loading the whole body before truncating it to 100 000 characters.
