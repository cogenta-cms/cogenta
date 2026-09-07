---
'@cogenta/core': minor
'@cogenta/agents-builtin': minor
'@cogenta/cli': minor
---

Fiche 73 task 7 — `theme.write_sandbox_file` (`tools@1.6`, permission `theme.write_sandbox`):
"Cogenta Theme Creator"'s second tool, for writing real theme code (not just proposing
tokens) into a sandbox.

Unlike `theme.propose_theme`, this tool is `sideEffects: true`/`reversible: true` — a real
write, gated by `withAutonomy` (R4) like any other effectful tool, `revert` deleting
exactly the file it wrote. Its scope is structurally bounded, not just documented: it can
only ever write inside one sandbox directory
(`<projectRoot>/.cogenta/theme-sandbox/<id>/`, fiche 73 task 4) — never `themes/`, never
anything a live request could resolve. A path that tries to escape the sandbox (`../`, an
absolute path) is refused (`THEME_SANDBOX_PATH_ESCAPE`, new `@cogenta/core` error code),
enforced host-side in `@cogenta/cli`'s new `writeSandboxFile`/`deleteSandboxFile`
(`theme-sandbox.ts`) — the tool itself has no filesystem of its own to guard, by design
(the same `resolveProvider`/`prClient` injection shape every other AI-backed tool in this
codebase uses).

`themeCreatorAgent`'s declared tool list grows to `['theme.propose_theme',
'theme.write_sandbox_file']`, wired end to end through `agent-runtime.ts` →
`theme-wiring.ts` (`createThemeSandboxToolWiring`, never gated on a configured LLM
provider — writing a file is not a model call) → `runServe`.

`identity.md` rewritten where it previously asserted, repeatedly and now falsely, that
this agent "n'écrit jamais de code de thème" and that "aucun outil, à aucun niveau
d'autonomie" could ever let it write anything real — a new, explicit second mode ("Écrire
du code de thème dans un bac à sable") replaces those claims, describing exactly when it
applies, the injected structure (manifest shape, the full seventeen-block vocabulary,
R3/R5, the sandbox path), and that it never bypasses the human-confirmed deploy pipeline
(fiche 73 task 5).

`docs/04-contrats.md` updated: `tools@1.6`, the new `theme.write_sandbox` permission
documented in the taxonomy.

New real tests: 8 in `packages/cli/test/theme-sandbox.test.ts` (real filesystem fixtures —
write, nested subdirectories, path-escape refusal for both a relative `../` and an
absolute path, refusing to clobber the sandbox's own reserved preview-adapter file,
delete, idempotent double-delete, and an end-to-end proof that a file written this way is
picked up by the very next preview); 3 new/updated in
`packages/agents-builtin/test/theme-creator/agent.test.ts` (execute, revert, and — the
important behavioral proof — that this tool actually gets gated by `withAutonomy` under
`propose` autonomy, unlike `theme.propose_theme`'s `sideEffects: false`).
