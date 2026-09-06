---
'@cogenta/agents': minor
'@cogenta/core': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Fiche feedback, two bugs reported live from the same test session: "je ne sais pas si le
traitement est en cours ou pas" (no feedback during a long agent run or theme generation),
and a reference screenshot attached to "personnalise le theme actuel pour qu'il soit comme
cette capture" that only ever changed accent colors, never the layout it showed.

**The reference-image bug, fixed**: `propose-theme.ts`'s `chooseTheme()` step already
received an attached image, but `generateSkinCandidates()` (the step that actually
produces the color/font/spacing tokens) never did — `generateSkin` had zero image support
at all. `@cogenta/agents`'s `GenerateSkinOptions`/`GenerateSkinCandidatesOptions` gain an
optional `images: readonly ChatImagePart[]`, threaded through to the model call alongside
an explicit "derive the colour palette from it" instruction when present.

**What is still a genuine limit, not fixed here**: a theme's page *structure* (which
blocks render where) is owned by the installed theme package's own render code — contract
D only ever describes tokens (color, font, spacing, radius, shadow, motion). No amount of
image analysis can turn a token-generation call into a layout generator; that would be a
different, much larger feature.

**Live progress**: new `@cogenta/agents` module `progress/` — `ProgressReporter`,
`ProgressEvent`, `createProgressJobStore<TResult>()` (in-memory, per-process; a progress
job is short-lived and watched by one open tab, unlike `@cogenta/core`'s durable `queue`).
`RunAgentLoopInput.onProgress`/`RunAgentOptions.onProgress` report `"Thinking…"`,
`"Calling tool "X"…"`, retry attempts, and tool outcomes as the agent loop runs — the same
engine behind both agent chat and every other agent, so instrumenting it once covers both.
`GenerateSkinCandidatesOptions.onProgress` and `ProposeThemeCandidatesInput.onProgress`
report each design direction as it starts/finishes. `RetryOptions.onRetry` is a new hook
`retryModelCall` invokes before backing off.

`@cogenta/core` gains two error codes, `AGENT_RUN_JOB_UNKNOWN` and
`THEME_GENERATE_JOB_UNKNOWN` (mapped to 404).

`@cogenta/api` adds three watchable job route pairs, additive alongside the existing
synchronous ones (nothing is removed or changed for a caller that doesn't care about
progress): `POST/GET /api/agents/:name/conversation/jobs[/:jobId]`,
`POST/GET /api/agents/:name/run/jobs[/:jobId]`, `POST/GET /api/theme/generate/jobs[/:jobId]`.
`AgentsRouterOptions`/`ThemeRouterOptions` gain an optional `progressJobs` store; without
one, only the job routes are unavailable — the pre-existing synchronous routes are
untouched.

`@cogenta/cli` wires `createProgressJobStore()` into `cogenta serve`'s agents and theme
routers, and forwards `onProgress` through `agent-runtime.ts`'s `AgentRunnerLike` adapter
(a real gap caught by an e2e test: the adapter's `run()` silently dropped the parameter
before this fix).

Admin UI (private, no changeset): the floating chat widget and the theme generator
workshop both poll their job's `GET` endpoint and render a live, growing progress list
(`data-testid="agent-chat-progress"` / `"theme-generator-progress"`, both `aria-live="polite"`)
instead of a static "thinking…" placeholder.
