---
'create-cogenta': patch
---

Scaffolding now writes a real, randomly generated `COGENTA_AUTH_SIGNING_KEY`
into a `.env` file next to `cogenta.config.mjs` (`randomBytes(32)`, base64),
plus a `.gitignore` covering `node_modules/`, `.env` and `.cogenta/`. Paired
with `@cogenta/core`'s new `.env` auto-loading (its own changeset), this
removes a real onboarding blocker: a brand-new user previously had to find,
run and correctly `export` a key-generation command themselves — with no
guidance on the Mac/Windows/Linux differences — before `cogenta serve` would
even start. `npm create cogenta` now produces a site that runs with zero
manual secret-handling steps.
