---
'@cogenta/core': patch
---

`loadConfig` now auto-loads a `.env` file next to `cogenta.config.mjs`, using
Node's own `process.loadEnvFile` (no new dependency, R9) — so a real secret
like `COGENTA_AUTH_SIGNING_KEY` no longer has to be exported by hand in every
shell before `cogenta serve` will start. Skipped whenever the resolved `env`
is not really `process.env` (identity check, not `options.env === undefined`
— real callers like the CLI's own `run()` resolve `options.env ?? process.env`
once and thread that same object down explicitly, so `options.env` is
"defined" even in a real, unconfigured shell; a test injecting its own
synthetic map is still exempt, since that map is a different object).

Found via the user's own real end-to-end test: `npx cogenta serve` refused to
start with "COGENTA_AUTH_SIGNING_KEY is not set", and the only documented fix
was a manual, shell-specific `export`/`$env:` command with no Windows/Mac/
Linux guidance. `create-cogenta` now writes a real generated key into `.env`
(see `create-cogenta`'s own changeset) — this is the half of the fix that
makes `cogenta serve` actually read it back.
