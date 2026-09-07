---
'@cogenta/agents': patch
'@cogenta/cli': patch
---

Fiche feedback, 2026-09-07: a reference screenshot attached to a theme-customization
request had zero visible effect through several live generation runs against a real
DeepSeek key — every candidate kept the same layout, only the accent colour changed, and
no warning was ever shown.

First attempt (reverted): declaring per-vendor "this LLM does not support vision"
capability flags in the provider catalog, and skipping the image attachment ahead of
time for any vendor flagged that way. Correctly rejected in review: which vendors and
models accept an inline image changes on its own schedule, outside this codebase's
control — a static allow/deny list goes stale the moment a vendor adds or drops support,
and is exactly the kind of assumption that should never be hard-coded. Confirmed the hard
way: once the hard-coded `deepseek: supportsVision: false` was removed and the image was
simply always attempted, DeepSeek actually used it — picking `@cogenta/theme-blog` (a
correct read of the attached WordPress-style reference) with an olive/green palette
matching the screenshot, something the earlier "just skip it" logic could never have
produced.

The actual fix: `propose-theme.ts`'s `processAttachments` no longer checks any declared
vision capability before attaching an image — it always forwards one, if given, to both
the theme-choice call and every skin-generation call. If a vendor's endpoint genuinely
cannot take an inline image, that surfaces as a normal call failure (already retried by
the existing correction loop, then reported through the job's own `{ ok: false, reason }`)
— shown to the operator in the theme generator, not guessed at in advance.

That failure is now also traceable server-side, not only visible to whoever was watching
the job live: `createProgressJobStore` takes an optional `logger` and calls
`logger.error('progress job failed', { jobId, error })` when a job's run rejects.
`cogenta serve` wires this from its own `Logger` for both the agents and theme
progress-job stores.

Separately, and unrelated to vision: a real `gpt-5-mini` request was rejected outright by
OpenAI (`400 Unsupported parameter: 'max_tokens' is not supported with this model. Use
'max_completion_tokens' instead.`) — OpenAI's reasoning-tier models reject the older
field rather than merely ignore it. `ProviderCatalogEntry.usesMaxCompletionTokens` (`true`
only for the genuine `openai` catalog entry — every `openai-compatible` clone still speaks
the older, more widely cloned `max_tokens`) and `createOpenAiClient`'s matching
`usesMaxCompletionTokens` config option fix this. This one *is* a per-vendor flag, but
for a different reason than vision support: it corrects a wire-protocol field name a
real, live request actually needs to succeed at all, not a guess about a model's
capability that could quietly become wrong.
