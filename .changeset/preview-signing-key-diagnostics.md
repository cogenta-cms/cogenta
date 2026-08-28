---
"@cogenta/api": minor
"@cogenta/cli": minor
---

Fiche 40 (diagnostics et messages d'erreur de configuration) — the exact bug
the user reported: `preview-token.ts` already threw a `CONFIG_INVALID` error
with a correct `hint` ("Set COGENTA_PREVIEW_SIGNING_KEY … `openssl rand -hex
32` … never in a configuration file"), but the admin only ever read
`caught.message`, throwing the `hint` away every time — so an editor clicking
"Prévisualiser" without the key set never saw what to do about it.

`@cogenta/api` exports `PREVIEW_SIGNING_KEY_MINIMUM_LENGTH` (`preview-token.ts`,
was already an internal `32` — additive, no behaviour change) so `cogenta
doctor` can check against the exact same number the token service enforces,
rather than a second `32` copied by hand that could silently drift.

`@cogenta/cli`'s `cogenta doctor` gains a proactive check: a missing or
too-short `COGENTA_PREVIEW_SIGNING_KEY` is now reported in `notes` (a
warning, same tier as the existing `COGENTA_STORAGE_SIGNING_KEY` note) —
never in `problems`, since the key is only needed once a draft is actually
previewed (`withPreview`, `packages/api/src/rest/router.ts`) and `doctor`
must never fail a site over an optional feature.

No contract touched: `PREVIEW_SIGNING_KEY_MINIMUM_LENGTH` is a plain
constant, not a tool, permission, schema field or theme hook.
