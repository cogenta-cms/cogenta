---
"@cogenta/plugins": patch
---

A plugin's `http.fetch` capability now refuses a response body over 1 MiB, times out a slow body, and cancels the host-side request when the plugin run ends (finished, timed out or killed). Capability handlers receive an optional `signal` in their call context.
