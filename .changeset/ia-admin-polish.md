---
'@cogenta/agents': patch
'@cogenta/api': patch
'@cogenta/cli': patch
'@cogenta/schema': patch
---

AI screens polish: providers can be tested from the admin (`POST /api/providers/:id/test`), an agent can run on "auto" (any enabled provider; the id `auto` is now reserved), agent runs are kept and listed (`agent-traces`), built-in prompts can be reset (`POST /api/prompt-templates/:id/reset`), the knowledge index is rebuilt at start-up when empty and on demand (`POST /api/assistant/reindex`), `cogenta channels` leaves a heartbeat the admin reads, a failed background job carries its error code, budgets must be zero or more, and search indexing skips record references and presentation settings.
