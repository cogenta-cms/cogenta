---
"@cogenta/agents": minor
"@cogenta/api": minor
"@cogenta/cli": minor
"@cogenta/schema": minor
---

L22 task 3: "l'agent qui surveille le site" — the one concrete case the lot's spec asks to ship first, tested end to end against a real `cogenta serve`. A superagent-shaped agent, disabled by default like the other two examples, that reads the public 404 log (never source code, never a request body or an IP — the log itself carries neither), picks a genuinely related, routed page, and proposes or creates a redirect depending on the site's configured autonomy — reusing the runtime `withAutonomyForManifest` already built for L22 task 1, not a bespoke gate.

`@cogenta/agents` gains a fourth built-in agent, "Site Monitor" (`SITE_MONITOR_AGENT_NAME`, `builtins.ts`), disabled by default with a daily cron trigger, autonomy `propose` by default — raising it to `autonomous` (autopilot) is what the lot names as the condition for an *applied*, not merely *suggested*, redirect. Four new contract-C tools back it: `logs.read_not_found` (new permission `logs.read`, read-only over `@cogenta/schema`'s `NotFoundLogStore`), `content.collections`/`content.list` (both under the existing `content.read` permission — browsing is the same access as reading one entry, not a wider grant), and `redirects.create` (new permission `redirects.write`, `sideEffects: true`, `reversible: true` — its `revert` removes exactly the redirect it created). Contract C moves to `tools@1.2` (`docs/04-contrats.md`): two permissions added by the bottom to an open taxonomy, no existing tool signature touched — the same kind of change `document.extract` was in `tools@1.1`.

`@cogenta/schema`'s `RedirectReason` gains a fourth value, `'agent'` — `redirects.create` always writes it, never `'manual'`, so an admin looking at the Redirections screen can tell which rows a human typed and which one an agent proposed and had applied. Additive to a stored, open list (not a versioned contract enum); a row written by an older build still reads back fine (`toRecord`'s existing fallback to `'manual'`).

`@cogenta/api` gains `createMonitoringRedirectSuggestionSource` (`notices/monitoring-redirect-suggestion.ts`) — the dashboard half: a redirect an agent proposed under `co-pilot` autonomy surfaces as an admin notice (from/to, which agent), linking straight to the *existing* Redirections screen rather than a second confirmation UI, and disappears on its own once the redirect exists (created by hand, or later applied under `autopilot`) — never because the underlying `ApprovalQueue` request was "decided" (L22 task 1's queue still has no admin surface to decide anything from).

`@cogenta/cli`'s `agent-runtime.ts` wires all four new tools into the site's real tool registry (the real `NotFoundLogStore`/`RedirectStore`/`CollectionDefinition[]` `serve.ts` already builds, never a second instance) and now exposes the runtime's `ApprovalQueue` on `AgentRuntimeAssembly` so `serve.ts` can build the notice source over the exact same queue `co-pilot` autonomy files into. `serve.ts` adds one more entry to the notices sources array — the seam fiche 38 designed this mechanism around — and threads `collections`/`notFoundLog`/`redirects` into `buildAgentRuntime`.

R2 holds throughout: with no LLM provider configured, the Site Monitor exists in configuration (seeded, listable, editable) and attempts zero network calls — `AgentRunner.run()`'s existing `AGENT_NO_PROVIDER` guarantee, unchanged, covers this agent the same as every other one.

**Deliberately out of scope, named honestly rather than silently promised**: server-error and downtime detection (the lot's own other two example anomalies) are not built — this task ships the one case the spec asks to land first, tested end to end; the other two stay documented ideas for a future lot.

No new dependency (R9): every new tool wraps a store or a route this project already had (`NotFoundLogStore`, `RedirectStore`, `ContentService.summary`/`list`, `buildPath`), and `@cogenta/agents` already depended on `@cogenta/schema`.
