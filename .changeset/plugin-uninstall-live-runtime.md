---
"@cogenta/cli": patch
---

Stop loaded plugin routes, content hooks, scheduled handlers and render invocations immediately when a plugin is uninstalled. Wait for existing executions before acknowledging removal, and require a restart before a reinstalled plugin can run again.
