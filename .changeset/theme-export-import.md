---
'@cogenta/cli': minor
---

Fiche 73 task 8 — export/import (§ 3.7), the last piece of the fiche: a theme leaves and
re-enters the mechanism as one portable zip file.

`exportThemeZip` zips `themes/<name>/` exactly as it sits on disk, streaming to a
caller-supplied sink. `importThemeZip` extracts an archive into a fresh sandbox —
**never directly into `themes/`**. This closes piège n°3 (zip-slip) by reuse rather than
a parallel implementation: every extracted entry goes through task 7's
`writeSandboxFile`, so an entry name that tries to escape the sandbox (`../../.env`, an
absolute path) is refused by the exact same guard a hand-typed agent path already has to
pass. Deploying the imported sandbox into `themes/<name>/` — where `verifyTheme`'s real
security scan runs — stays a separate, explicit next step
(`checkThemeDeployment`/`deployThemeFromSandbox`, task 5): an imported theme gets no
shortcut past that gate, matching the fiche's own "un import n'est jamais un raccourci
qui contourne la vérification".

Zero new dependency (R9): reuses `@cogenta/export`'s `createZipWriter`/`openZip`, the
same zero-dependency, store-mode ZIP reader/writer `cogenta backup` already uses.

`writeSandboxFile`'s `content` parameter widens from `string` to `string | Buffer`
(additive) — a zip entry is not assumed to be UTF-8 text.

5 new real tests (`packages/cli/test/theme-export.test.ts`, real filesystem and real ZIP
round trips, nothing mocked): export refusal for a nonexistent theme, a real exported zip
readable back by `openZip`, import into a fresh sandbox with byte-identical content, a
full deploy → export → import → deploy-again round trip, and a zip-slip regression test
built with the real writer (a genuine malicious archive, not a hand-typed fixture) proving
`importThemeZip` refuses and never writes outside the target sandbox.

With this task, fiche 73 (`docs/plans/73-themes-locaux-bac-a-sable-ia.md`) is complete:
all 8 tasks delivered as tested, reviewed mechanisms. No HTTP route or admin screen for
any of tasks 4-8 yet — an honest, consistently documented gap across every one of them:
each ships the underlying, tested primitive; wiring the admin UI on top is separate,
later work.
