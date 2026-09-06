---
'@cogenta/core': minor
'@cogenta/agents': minor
'@cogenta/api': minor
---

Every hardcoded value that controlled an LLM call's behaviour (output token budget, retry/correction attempts, request timeout) is now a real, admin-configurable property of the provider, editable from `/admin/providers` — never a number guessed in code and shared across every model an operator might configure.

An audit of the whole `@cogenta/agents` call surface found the same class of bug independently reproduced and patched in more than one place with a different hardcoded constant each time (theme/skin generation, the generic agent runtime, the delegated-subagent budget, the `assist.*` toolset, the LangGraph loop's per-call timeout) — always the same root cause: a reasoning-tier model (confirmed live against DeepSeek) spends thousands of tokens "thinking" before writing a visible answer, and a fixed ceiling sized for a plain instruct model truncates it to an empty response.

- `ProviderClient` gains `maxOutputTokens`/`requestTimeoutMs`/`maxCorrectionAttempts` — resolved once per client from the admin's saved provider config (`StoredProviderConfig`, `ProviderConfigInput`), falling back to a built-in default only when unset. `ChatRequest.maxTokens` is now optional; when a caller omits it, the resolved client's own budget applies.
- `createAnthropicClient`/`createOpenAiClient`/`createGoogleClient` accept these three as config and apply them to every request and to the per-call HTTP timeout (`requestSignalWithTimeout`).
- Every call site that used to hardcode its own `MAX_TOKENS`/`DEFAULT_MAX_ATTEMPTS` (skin generation, the base-theme choice, brief analysis, content-model/demo-content proposals, the generic agent loop, the delegated-subagent tool, the `assist.*` toolset) now defers to the resolved client instead — removing eight separately-guessed numbers, not just the one already fixed for skin generation.
- New error code `PROVIDER_TUNING_INVALID` — a saved value outside sane bounds (1-200000 tokens, 1-600000ms, 1-10 attempts) or not a whole number.
- Deliberately left as fixed policy, not exposed per provider: the LangGraph loop's tool-call step ceiling (`maxSteps`) and repetition guard (`maxRepeats`), and the theme generator's candidate-count bounds/image-generation dimensions — these are product/orchestration decisions, not a fact about which model an admin chose.
