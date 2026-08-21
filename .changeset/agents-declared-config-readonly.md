---
"@cogenta/api": minor
---

`GET /api/agents` and `GET /api/agents/:name` now pass through the rest of contract C's
`AgentDeclaration` that was already real but never left the server: `skills`,
`subagents`, `model`, `memory` and `triggers`. `AgentSummary`/`AgentRegistryLike` gain
these fields, all optional and typed `unknown` exactly like the existing `autonomy`/
`budget` fields, for the same reason — this package stays structural, never gaining a
hard dependency on `@cogenta/agents` just to describe them. Purely additive: an existing
caller whose `AgentRegistryLike` implementation never set these fields simply omits them
from the response, same as before.

Lets `packages/admin`'s Agents screen (fiche 4, L21 task 4) show an agent's full
declared configuration — per-tool autonomy overrides, all three budget metrics, the
complete contract C permission checklist, skills, subagents, model preference, memory
configuration and triggers (including cron schedules) — instead of only the enable
toggle, `autonomy.default` and `budget.tokensPerDay`. Everything beyond enable/disable
is shown **read-only**: no `AgentRegistry` in this codebase can persist an edit to any
of these fields today, so an editable control for them would have no real backend
effect (R6).
