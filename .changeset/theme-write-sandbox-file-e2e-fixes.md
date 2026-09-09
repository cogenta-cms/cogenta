---
'@cogenta/core': patch
'@cogenta/agents': patch
'@cogenta/agents-builtin': patch
'@cogenta/cli': patch
'create-cogenta': patch
---

Fiche 73 task 7's own live end-to-end test (a real `cogenta serve`, a real browser session,
a real gpt-5-mini) found five real, distinct gaps in `theme.write_sandbox_file` — none of
them visible in the unit suite alone — all fixed here:

1. **Migration gap**: a site whose "Cogenta Theme Creator" agent record was created before
   this tool shipped never gained it — `ensureBuiltinAgents`'s "never touch an existing
   seed" policy had no exception for it (unlike the existing `grantContentBrowse`
   precedent). New `grantThemeSandboxWrite` (`packages/agents/src/agents/builtins.ts`)
   closes it the same way, additively, on every `cogenta serve` boot.

2. **Missing dependency**: no site `create-cogenta` scaffolds ever declared
   `@cogenta/theme-kit` as a direct dependency — only transitively, through
   `@cogenta/theme-canonical` — so a custom sandbox theme's own `import { h } from
   '@cogenta/theme-kit'` (exactly what this tool tells a model to write) failed to resolve
   under a package manager that does not hoist transitive dependencies. Added to
   `packageJsonContents` (`create-cogenta/src/scaffold.ts`).

3. **Silent, deferred failures**: a written `theme.config.*`/`theme.render.*` that doesn't
   conform to contract D used to only fail much later, at the next preview or deploy click,
   disconnected from the write that caused it. `writeSandboxFile` (`theme-sandbox.ts`) now
   validates for real before a write lands — importing `theme.config.*` and re-checking it
   with `parseThemeManifest`, and for `theme.render.*`, running the exact same real preview
   (`renderSandboxPreview`, same isolated worker, same `serialize()` call) the sandbox's own
   "Aperçu" button runs. A write that fails either check is rejected with the real error
   (new `THEME_SANDBOX_FILE_INVALID`) and rolled back to whatever was there before, so the
   agent's next call always builds on a sandbox that is at least self-consistent. Proven live:
   a real agent run that used to fail silently now retries against the real error until both
   files actually render.

4. **No worked example**: the tool's own description named the contract by number but never
   showed its actual shape, so a model reliably reinvented a plausible-looking but wrong one
   (`blocks` as a block-name array instead of a semver range, `runtime` as an object instead
   of a literal, inline token data instead of a `tokens` path, a `ctx.theme.tokens` that does
   not exist in the real `RenderContext`). The description now carries one concrete, minimal,
   real `h()`-based `renderPage`/`renderChrome` pair. Measured live on the same live agent,
   same brief, same model: 12+ failed attempts without the example, 2 with it.

5. **Deploying (or restoring) a theme while `cogenta serve` is already running could leave it
   permanently invisible** — to the Appearance gallery, and, worse, silently unresolvable as
   the actual `activeTheme` (falling back to the default theme with no error anywhere). Root
   cause: `theme-registry.ts`'s `filesystemThemeCache` has no invalidation of its own — a name
   resolved once (an earlier failed deploy attempt with the same name, `theme.propose_theme`'s
   own `availableThemes()` call, or any other lookup before the real files existed) stayed
   cached as unresolvable for the rest of the process's life. New `invalidateFilesystemTheme`,
   called by `deployThemeFromSandbox` and `restoreThemeVersion` right after they change
   `themes/<name>/`. Proven live: deployed and activated a real agent-written theme, and the
   public site immediately served real content through it — no restart needed.

New tests: 6 in `packages/cli/test/theme-sandbox.test.ts` (wrong-shape manifest rejected,
rollback on a failed rewrite, missing exports rejected, the exact live failure — two real
functions returning plain data instead of an `HtmlElement` — rejected even though both
exports exist, a well-formed module accepted, and a sandbox that becomes valid between two
checks is reported valid rather than stuck on its first, since-fixed failure); 2 in
`packages/agents/test/agents/builtins.test.ts` (an existing theme-creator record gains the
tool, an unrelated agent is left alone); 1 in
`packages/cli/test/theme-registry-filesystem.test.ts` (a theme name resolved once before it
existed resolves correctly once real content lands at that name, in the same process).
