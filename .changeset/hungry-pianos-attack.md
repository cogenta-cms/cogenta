---
'@cogenta/core': minor
---

Add typed errors and configuration loading.

`CogentaError` carries a stable `code`, an actionable `hint` and opt-in structured
`details`. It is the only error library code throws — a bare `throw new Error("…")`
gives callers nothing to branch on and users nothing to act on.

`defineConfig` types `cogenta.config.ts`; `resolveConfig` validates it and applies
defaults, then environment overrides. Secrets (`llm.apiKey`, `storage.accessKeyId`,
`storage.secretAccessKey`) are rejected in the config file and read from the
environment only. Unknown keys are errors rather than silently ignored settings, an
invalid configuration reports every offending field at once, and the database driver
is inferred from the URL scheme when it is not named.
