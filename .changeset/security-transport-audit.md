---
"@cogenta/schema": patch
"@cogenta/api": patch
"@cogenta/cli": patch
"@cogenta/agents": patch
"@cogenta/core": patch
"@cogenta/mcp": patch
---

Reject executable menu destinations and neutralize legacy unsafe links during rendering. Share media role grants across REST and MCP so viewers cannot mutate assets or folders.

Use the same decorated content stores for HTTP and MCP, preserve the site's default locale and actor attribution, and govern MCP calls through autonomy and the hash-chained audit log. Add a shared file approval queue so administrators can decide non-reversible MCP and runtime actions across processes. Decisions are atomic, immutable and replay-protected; disconnected calls cannot execute after later approval.

Preserve MySQL metadata column casing explicitly when repairing taxonomy foreign keys, so the reversible schema migration reads the existing delete rule instead of attempting to duplicate the constraint.
