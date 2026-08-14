---
'create-cogenta': minor
'@cogenta/core': patch
---

`create-cogenta` — AI skin generation with hard-refusal validation (L9 task
7). When an LLM provider is configured with a valid key and a free-text site
description is given, the `blog` blueprint's `theme.tokens.json` is generated
from that description instead of copying the theme's default: the model is
asked for contract D's token JSON only (never CSS), and every candidate is
checked by `@cogenta/render`'s existing `validateSkin` — reused wholesale,
not reimplemented — in hard-refusal mode (AA contrast on every pair, a
strictly monotone type scale, the full closed token set, `motion.reduced`).
On a rejection, the thrown `CogentaError`'s `message`/`hint` become the next
attempt's correction prompt, for three attempts. A successful candidate is
rendered on three real preview pages (through the same generic
`renderPage`/`renderBlock` pipeline a live site uses) written to
`.cogenta/skin-preview/`, and the installer offers accept, regenerate, or
fall back to the default — bounded so a non-interactive `--yes`/`--config`
run never loops. Every outcome — generated and accepted, regenerated,
fallen back after failed validation, or never offered — is reported by name
in the install recap; nothing is silent.

Scoped to the `blog` blueprint only, the one blueprint that writes a
`theme.tokens.json` today. Regenerating a skin after install (`cogenta skin
generate`) is explicit CLI surface the lot doc lists under a later task (L9
task 9) and is not built here.

One new `@cogenta/core` error code: `SKIN_GENERATION_RESPONSE_NOT_JSON`, for
a model response that is not a single JSON object.
