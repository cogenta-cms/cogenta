---
'@cogenta/cli': patch
---

`cogenta serve`'s theme-render fallback (added in a previous, unreleased
change on this package) 404'd on `/` itself: every `page` collection's route
pattern is `/:slug`, which structurally cannot match an empty segment. `/`
now retries once as `/home` — the real, consistent slug every
`create-cogenta` blueprint seeds its home page at — before giving up. A site
with no page at that slug still 404s honestly, exactly like any other
unmatched path; this is not a magic redirect.

Also fixes `runServe` passing its resolved `env` object down to `loadConfig`
in a way that always looked "explicitly supplied" (see `@cogenta/core`'s
`env-file-autoload` changeset) — without this, `@cogenta/core`'s new `.env`
auto-loading could never actually fire from a real `cogenta serve` run.

Both found via the user's own real end-to-end test against a freshly
scaffolded Portfolio-blueprint site: `/` returned `CONTENT_NOT_FOUND`, and
`cogenta serve` still demanded a manually exported signing key despite a
`.env` file sitting right next to the config.
