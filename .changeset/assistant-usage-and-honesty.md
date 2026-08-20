---
'@cogenta/core': minor
'@cogenta/agents': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Fiche 30 — agents and assistant admin:

- `@cogenta/core`: adds a resolved `assistant.monthlyTokenLimit` config section (default one million tokens a month) and a new `ASSIST_BUDGET_EXCEEDED` error code.
- `@cogenta/agents`: adds `createAssistUsageTracker`, a per-tool, calendar-bucketed token/call counter for the writing assistant (distinct from the existing per-agent `BudgetTracker`), wired into `createAssistToolset` and `createAssistRuntime` (`AssistRuntimeOptions.onUsage`, `AssistRequest.tool`). `AssistToolset` gains optional `model` and `usage` fields.
- `@cogenta/api`: `GET /api/assistant` now reports `model`, `usage` (when a tracker is configured) and `vector` (driver/dimensions/count/lastIndexedAt, when a vector store exists). `POST /api/assistant/run` refuses with `ASSIST_BUDGET_EXCEEDED` (429) once the monthly cap is reached, before the provider is called. `createAssistantRouter` gains an optional `vectorInfo` option.
- `@cogenta/cli`: `AssistantAssembly` gains `vectorInfo` (vector index visibility) and wires a usage tracker into the assistant toolset from `config.assistant.monthlyTokenLimit`. `withVectorIndexing` gains an optional `onIndexed` callback. `recordContentAudit` now records an accepted assistant suggestion's `field`/`tool` (sent by the admin as `assistApplied` on a content save) distinctly in the audit diff, alongside contract A's existing `provenance`/`provenanceDetail`.

All additive — a site with no `assistant` config section gets the same default cap as before, and a site with no AI provider sees no `usage`/`model`/`vector` fields at all.
