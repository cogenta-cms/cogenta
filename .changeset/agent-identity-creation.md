---
"@cogenta/agents": minor
"@cogenta/api": minor
---

Fiche 55 (agent creation, full flow): `AgentIdentity`/`StoredAgentIdentity`/`AgentIdentityFields`
gain an optional `systemPrompt`, distinct from `style` — a fourth, additive `## System
prompt` section in `renderIdentityMarkdown`/`parseIdentityMarkdown`, included in the
assembled context (`identity/context.ts`'s `agentSection`) right after `style` when
present. An `identity.md` written before this change (no such section) still parses —
`systemPrompt` simply comes back `undefined`.

`AgentModelPreference` gains an optional `model`: an explicit model id for one agent,
distinct from `preferred`/`fallback` (which name a *provider*). When set,
`createAgentRunner`'s `resolveProvider` returns a `ProviderClient` whose `model` is
overridden to it; absent means "use whatever the resolved provider is configured with",
the behaviour every agent had before this field existed.

New tool `assist.generate_agent_identity` (`@cogenta/agents`, permission
`content.suggest`, `sideEffects: false`): drafts a `role`/`objectives`/`style`/
`systemPrompt` from a short brief and a tool-name list, always as a reviewable draft
(`applied: false`, pinned literal — R6). The site owner's purpose and constraints travel
through `assembleContext`'s DATA channel exclusively, never interpolated into the
instruction text, the same posture L19's `analyseBrief` already takes with an uploaded
brief (R8, applied defensively even to this first-party admin-form input). Seeded as a
new builtin prompt template ("Generate agent system prompt", fiche 45), editable from
the Prompt Settings screen.

`@cogenta/api`'s `agents-router.ts`: `AgentWriteInput.identity` and
`AgentRegistryLike.readIdentity`'s return type both gain the same optional
`systemPrompt`. A non-string `identity.systemPrompt` is refused with
`AGENT_DEFINITION_INVALID` (400), same as an invalid `role`.

Hardening (security review): `identity/context.ts`'s `agentSection` now escapes
`name`/`role`/`objectives`/`style`/`systemPrompt` with the same `escapeForTag` the `data`
channel already used, so a literal `<`/`>`/`"` in any of them — most plausibly in a
`systemPrompt` a "generate" click filled with raw model output before a human saved it —
can no longer forge a fake `</agent><task>…` boundary in the assembled system prompt.
Defense in depth, not a fix to an exploitable path: `withAutonomyForManifest` never reads
this text, so no permission or autonomy level could ever be affected by it.

All additive — no existing field, tool signature, or wire shape changes meaning.
