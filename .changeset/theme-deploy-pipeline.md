---
'@cogenta/cli': minor
---

Fiche 73 task 5 — the deploy pipeline (§ 3.4): `checkThemeDeployment`/`deployThemeFromSandbox`
in `theme-sandbox.ts`, promoting a sandbox into `themes/<name>/`.

`checkThemeDeployment` reuses `verifyTheme`/`loadTheme` (task 1, `@cogenta/render`) exactly
as written — the structure and security scans, never re-implemented. It is read-only, safe
to call repeatedly (an admin confirmation screen can call it on every keystroke), and
`deployThemeFromSandbox` re-runs it itself right before ever touching `themes/`, rather than
trusting a check a human read a moment earlier: a sandbox that becomes invalid in the gap
between "here's what's wrong" and "confirm" is still refused.

Deploying archives the previous `themes/<name>/`, if one existed, into
`themes/.versions/<name>/<timestamp>/` first (a real, recursive file copy — a filesystem-safe
timestamp, since Windows refuses `:` in a path) rather than overwriting it in place, then
replaces it with the sandbox's contents. The sandbox's own disposable preview-adapter file
(task 4) is filtered out of the copy — never carried into a deployed theme.

Honest note carried from task 4: `inspectTheme`'s findings (a forbidden import, an
unanalysable dynamic import, CommonJS, a missing vocabulary block) have no "warning" severity
distinct from "refusal" today — every one of them already blocks. `checkThemeDeployment`
reports exactly what the scan actually refuses; it does not invent a separate warnings list
that would always be empty.

6 new real tests (`packages/cli/test/theme-sandbox.test.ts`, real filesystem fixtures, no
mocks): refusal with no render module, refusal on missing vocabulary blocks, refusal on a
forbidden import (never copied into `themes/`), a successful deploy, a redeploy that archives
the prior version and updates the manifest, and the stale-check race described above.

No HTTP route or admin screen for this pipeline yet — same honest gap as task 4: the
mechanism is delivered and tested, wiring it into `cogenta serve` is separate follow-on work.
