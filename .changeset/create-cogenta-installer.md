---
'create-cogenta': minor
---

Add `create-cogenta`, the `npm create cogenta` installer wizard (L9 task 1):
environment check, site/blueprint/database/LLM prompts (or `--yes` /
`--config <file>` for a non-interactive install), a real API-key validation
round trip when an LLM provider is configured, and scaffolding that writes a
loadable `cogenta.config.mjs` and genuinely runs migrations plus the first
admin-user creation against a real SQLite database by reusing
`@cogenta/cli`'s own `runMigrate`/`runUsers`.

The blueprint menu lists one working entry (`blank`) plus eight named,
visibly-disabled "coming soon" entries; picking one of those falls back to
`blank` and always says so, never silently. AI skin generation and passkey
enrollment are out of scope for this task and are deferred to later work —
the recap says so explicitly rather than fabricating either.
