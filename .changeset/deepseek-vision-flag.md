---
'@cogenta/agents': patch
---

Fiche feedback, 2026-09-07: a reference screenshot attached to a theme-customization
request had zero visible effect through three separate live generation runs against a
real DeepSeek key — every candidate kept the exact same layout as the default theme,
only its accent colour changed, and no warning was ever shown.

Root cause: `createOpenAiClient` (the one client shared by every `openai-compatible`
catalog entry — OpenAI itself, OpenRouter, DeepSeek, Qwen, GLM) reported
`supportsVision: true` unconditionally. DeepSeek's chat-completions endpoint does not
accept an inline image, so `propose-theme.ts` — which already has the correct
"attach the image only if `client.supportsVision === true`, otherwise raise an explicit
warning" logic — was attaching the screenshot to a request DeepSeek silently drops,
instead of raising the warning it is designed to raise for exactly this case.

`ProviderCatalogEntry` (`providers/catalog.ts`) gains an optional `supportsVision`
field, `false` for `deepseek`, unset (assume vision-capable, unchanged) for every other
entry. `createOpenAiClient`'s new `supportsVision` config option lets `registry.ts`
carry that flag from the catalog into the built client; left unset, a client reports
vision support exactly as before this fix. With a DeepSeek provider configured, a
theme-generation request with an attached image now correctly shows
"could not be analyzed — the configured provider does not support image input" instead
of silently ignoring the image while implying it was used.

This does not add vision support to DeepSeek — it cannot see images at all — it only
makes the existing honest-degradation path actually fire for it, instead of the DeepSeek
request pretending to see something it never received.
