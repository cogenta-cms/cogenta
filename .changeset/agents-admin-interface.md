---
'@cogenta/agents': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Add the agent administration interface (L5 task 9): "état, autonomie,
budget, historique, traces".

`@cogenta/agents`: `BudgetTracker` gains `usage(): BudgetUsage` — a
read-only snapshot of the same three calendar-bucketed counters
`checkCall`/`recordCall` already track, needed so an admin can show
real spend against budget.

`@cogenta/api`: a new `/api/agents` router (`createAgentsRouter`),
structural against `AgentRegistryLike`/`TraceStoreLike`/`AuditLogLike`
— no hard dependency on `@cogenta/agents`. Lists agents with their
state/autonomy/budget/usage, enables/disables one, and reads its
traces/history (empty list, not an error, when a trace store or audit
log was not wired in).

`@cogenta/cli`: `assembleSite` accepts an optional `agents` option;
`/api/agents` is only mounted when it is supplied — no site constructs
one today, so every existing deployment is unaffected (R2).

`@cogenta/admin`: a new "Agents" screen — a list with enable/disable
per row, and a detail panel showing recent traces and history for the
selected agent.
