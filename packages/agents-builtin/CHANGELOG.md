# @cogenta/agents-builtin

## 0.5.0

### Minor Changes

- [`b305d67`](https://github.com/cogenta-cms/cogenta/commit/b305d672ca44858646f3929d08bf37a66bd47a3d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - **Images get an owner: a "Cogenta Image Creator" agent, and a way to keep what
  it makes.**
  
  `assist.generate_image` could produce candidates and, by its own contract,
  store nothing — so an image a model made could be looked at and never kept.
  Nothing bridged generating and keeping.
  
  `media.store_generated_image` is that bridge, and deliberately the only one.
  Every file it writes is recorded as `generated`, naming the agent and the
  model. `sideEffects: true` with `reversible: false` puts it through
  `withAutonomy`'s forced-approval path **whatever** the configured level, so
  `autonomous` cannot fill a library on its own: generating is the agent's,
  keeping is the operator's. `alt` is required, not optional — a model that can
  describe an image well enough to generate it can describe it well enough to be
  read aloud.
  
  The host side (`createImageLibrary`, `@cogenta/cli`) decodes the data URL and
  refuses anything that is not an inline image: a remote URL would be a
  server-side fetch whose target an agent's prompt chose. It refuses a type this
  site does not store and an image that decoded to nothing, and mints the id
  before the storage key so two pictures from the same prompt never collide.
  
  The agent itself is disabled by default like every other seed, pinned to
  `autonomy: propose`, and given a small budget — image generation is the most
  expensive call in this codebase by an order of magnitude. Its identity says
  what a good site image is: no text baked in (it cannot be translated or
  corrected), composed for the slot it has to sit in, room left where a title
  will go, and never an invented person presented as real.
  
  One governance catch, fixed: adding provenance to `MediaAsset` had quietly
  widened `media.read`'s output. Contract C figures a shipped tool's signature —
  which is why `folderId` was stripped there rather than added — so provenance
  is stripped the same way, with a test that keeps it out.

- [`1ab1990`](https://github.com/cogenta-cms/cogenta/commit/1ab199086a561728f3c25165a214d42736efab5d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - **A generated theme is told what the site actually stores.**
  
  A theme is a container for content, and a writer that does not know the
  container's shape guesses at it. A guessed collection name renders nothing —
  and the tempting fix for "nothing renders" is to hardcode articles into the
  markup, where they cannot be edited from the admin, cannot be translated, and
  cannot grow past the three the design happened to show.
  
  `createThemeWiring` now takes the site's `collections` and describes them for
  the writer — each collection's real name, its fields, and whether it has a
  public page worth linking to or should be rendered inline. Both the
  generation and the refinement paths receive it, and a caller with no schema in
  hand simply omits it, leaving the prompt as it was.

- [`d222023`](https://github.com/cogenta-cms/cogenta/commit/d222023000e4933c5c8cefe21bb1c64fafd34b67) Thanks [@georgesmomo](https://github.com/georgesmomo)! - **Generating a theme becomes a conversation, and starts producing themes that
  resemble what was asked for.**
  
  A live report: attach a screenshot of a design, and what comes back is nowhere
  near it. Three causes, none of them the model.
  
  *The palette was structurally locked.* The brief told the writer to reference
  `--cogenta-*` and never invent a colour — but those custom properties are
  generated exclusively from the *site's* skin, so any generated theme was
  repainted in whatever palette the site already had, however accurate its
  layout. A theme's own stylesheet is emitted after the skin's, so it can and
  now does carry its own design palette (namespaced, never overwriting
  `--cogenta-*`, which would silently disable the operator's own colour
  controls). No mechanism changed — only the instruction that forbade it.
  
  *The run was open-loop.* A write earned "accepted" or a structural rejection;
  the model never saw the page its code rendered. New `theme.preview_sandbox`
  exposes the render the admin preview screen was already using, so the writer
  can look at its own output and correct it. `theme.list_sandbox_files` and
  `theme.read_sandbox_file` complete the set — without them a second turn is
  handed a theme it has never seen, and can only guess or rewrite everything.
  
  *The system prompt was a sentence and ten bullets*, while everything about
  what a Cogenta theme actually is sat in a tool `description` — read as API
  reference for one call, not as standing knowledge. `assembleContext` gains a
  `specification` level (CONSTITUTION → SITE → AGENT → SPECIFICATION → TASK),
  unescaped because a specification is mostly markup examples and escaping them
  teaches the wrong output. The writer is now told to look, plan, write,
  preview and correct, in that order, instead of opening with "write the files
  now".
  
  **Every turn after the first continues from what exists.** `generateSkin`
  gains `baseTokens`: the current values are shown to the model with an
  instruction to change only what was named. Until now `baseline` only reworded
  the brief and re-derived every value, so each follow-up answered with a
  different theme rather than the same one, adjusted. `POST
  /api/theme/refine/jobs` (admin-only, polled through the existing generate-job
  route) handles both candidate shapes — a custom layout is re-read from its
  sandbox, a token candidate continues from its own tokens — and refuses a
  request that names nothing to continue from.
  
  **A theme displays the site's content; it never contains it.** The
  specification now says so with its reasons: content baked into a theme cannot
  be edited from the admin and has no translations. No invented posts, no
  `href="#"`, labels through `ctx.t`, an empty list renders as an empty state.
  A write whose module contains `href="#"` comes back with a warning in its
  receipt — reported, not refused, since a fragment target is legitimate.
  
  Also: one theme is generated by default (the brief's own count is honoured
  when it asks for several) instead of burying the real answer under recolours;
  a `summary` accompanies the full `rationale`, capped, after a run answered a
  card with several thousand words; and progress events carry a `kind` and the
  tool they concern, so a client no longer classifies them by pattern-matching
  English prose.

### Patch Changes

- Updated dependencies [[`b305d67`](https://github.com/cogenta-cms/cogenta/commit/b305d672ca44858646f3929d08bf37a66bd47a3d), [`8f0e946`](https://github.com/cogenta-cms/cogenta/commit/8f0e946573b8d8b31c89c956bb75d9a1eb6061a2), [`a07af67`](https://github.com/cogenta-cms/cogenta/commit/a07af679fbf5bede790acf95c430f8e23a66bb81), [`8aa73b8`](https://github.com/cogenta-cms/cogenta/commit/8aa73b8f6aea971e23ad72a744ccb5a251d59ac9), [`489ad82`](https://github.com/cogenta-cms/cogenta/commit/489ad82ec4703bb362638b7930d485ffd47316f0), [`d222023`](https://github.com/cogenta-cms/cogenta/commit/d222023000e4933c5c8cefe21bb1c64fafd34b67)]:
  - @cogenta/agents@0.7.0
  - @cogenta/core@0.9.0

## 0.4.0

### Minor Changes

- **"Générer un thème avec l'IA" can now actually write a custom page layout, not only
  recolour an already-installed one.** A live user report: the admin screen only ever called
  `theme.propose_theme` directly (`POST /api/theme/generate`, `@cogenta/cli`'s
  `theme-wiring.ts`) — a pure token-adjustment path — so no request, however detailed, and no
  attached reference screenshot, however different, could ever change more than colours/fonts
  of the theme already active. `theme.write_sandbox_file` (fiche 73) already existed and could
  write a real layout, but nothing on this screen ever reached for it.
  
  New in `@cogenta/agents`: `classifyThemeLayoutNeed` (`theme-creator/layout-classifier.ts`) —
  a small classification call deciding whether a request needs a genuinely different page
  structure or whether adjusting an installed theme's tokens is enough, reusing the same
  attachment-processing (`theme-creator/attachments.ts`, extracted from `propose-theme.ts` so
  both share one implementation).
  
  New in `@cogenta/agents-builtin`: `generateSandboxTheme` (a real tool-calling agent run,
  `theme.write_sandbox_file` as its only tool, `autonomy: 'autonomous'` scoped to this one
  call — legitimate because a sandbox write is inert until the pre-existing, separately
  human-confirmed deploy step promotes it, never the catalog "Cogenta Theme Creator"
  declaration's own `propose` default used by its other entry points) and
  `generateThemeCandidates`, the new single entry point tying classification, token
  candidates and a sandbox candidate together. **A reference image always forces the
  custom-layout attempt**, regardless of the classifier's own verdict — a live run against a
  real screenshot showed the classifier alone judged "tokens are enough" for a request an
  installed theme could not actually reproduce (a floating review badge over the hero, an
  icon-stat band, a circular experience badge) because it *does* have a hero/stats/about
  section "in some form"; an attached image is the strongest, least ambiguous signal an
  operator wants visual fidelity to a specific composition, not a plausible section list.
  
  Also fixed, found by the same live run: a model asked to write `theme.render.*` named its
  file `theme.render.tsx` — a name neither `CONFIG_MODULE_NAME` nor `RENDER_MODULE_NAME`
  recognised, so the write silently succeeded while the file was never importable (this
  sandbox has no build step; a plain ESM `import()` cannot transform JSX) and the preview
  failed with a generic, unhelpful "no theme.render.{js,mjs,ts} yet". `theme-sandbox.ts`
  (`@cogenta/cli`) now recognises this specific near-miss and rejects it with the real reason,
  letting the agent's own self-correction loop actually fix it instead of dead-ending.
  
  `@cogenta/api`'s `theme-router.ts` gains `SandboxCandidateLike`/`ThemeGenerateCandidateLike`
  (additive — existing `SkinCandidateLike` gains a required `kind: 'tokens'` discriminator).
  The admin screen (`@cogenta/admin`, no changeset — private) renders either candidate kind:
  a sandbox candidate previews through the same real, isolated-worker render the "Gérer les
  thèmes locaux" screen's own "Aperçu" already uses, and "Activer" runs the existing
  check → deploy → `PUT /api/theme/overrides` pipeline, never a new write path.
  
  Verified live end-to-end against a real reference screenshot and a real provider: the
  classifier's own decision, a real multi-file agent run (manifest + render module + CSS,
  self-correcting on a rejected write), a real preview render, a real deploy, activation, and
  the public site serving the generated layout — not a recolour of `@cogenta/theme-portfolio`,
  a distinct header/hero/stats/about composition matching the reference's actual structure.

- [`858aec8`](https://github.com/cogenta-cms/cogenta/commit/858aec8a332fe434975e34b6f9b2a1ec173b65cd) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fiche 73 task 7 — `theme.write_sandbox_file` (`tools@1.6`, permission `theme.write_sandbox`):
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

### Patch Changes

- Fiche 73 task 7's own live end-to-end test (a real `cogenta serve`, a real browser session,
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
- Updated dependencies [`c9dffa4`, [`10db071`](https://github.com/cogenta-cms/cogenta/commit/10db07162f24b56d750770480ebb2b5e2868773a), [`b0c8677`](https://github.com/cogenta-cms/cogenta/commit/b0c86775f2fe8d68bce3a5b248803911b57ed71f), `c9dffa4`, [`858aec8`](https://github.com/cogenta-cms/cogenta/commit/858aec8a332fe434975e34b6f9b2a1ec173b65cd)]:
  - @cogenta/agents@0.6.0
  - @cogenta/core@0.8.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`c5723d4`](https://github.com/cogenta-cms/cogenta/commit/c5723d428ae3616e9da442b2321c4f5e1480b8c4)]:
  - @cogenta/agents@0.5.1

## 0.3.1

### Patch Changes

- Updated dependencies [[`13a7989`](https://github.com/cogenta-cms/cogenta/commit/13a79891c3e0c64137ac74e838c4a30fc03e9f7f), [`89e7579`](https://github.com/cogenta-cms/cogenta/commit/89e7579129712a5978ff57b884151731f5c340ea)]:
  - @cogenta/agents@0.5.0
  - @cogenta/core@0.7.0

## 0.3.0

### Minor Changes

- [`76c000f`](https://github.com/cogenta-cms/cogenta/commit/76c000f12a5200d0664cc904bf52b90343da0768) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the "Cogenta Theme Creator" agent (`themeCreatorAgent`) and its only tool, `createProposeThemeTool` (`theme.propose_theme`, contract C `tools@1.5`, permission `theme.customize`). `sideEffects: false` — there is no write path at any autonomy level; the tool only ever proposes theme candidates via `@cogenta/agents`' `proposeThemeCandidates`, and activating one stays the existing human action on `PUT /api/theme/overrides`. Catalog-only, disabled by default like every other agent in this package.

- [`df06c56`](https://github.com/cogenta-cms/cogenta/commit/df06c56cf17b17fe7a636e03e712698d895e5db4) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fix the Appearance screen (and `theme.propose_theme`) reporting "no LLM provider configured" even after one is set up — two compounding bugs, both real:
  
  1. `theme-wiring.ts` resolved a provider **once**, at `cogenta serve` boot, and captured it — a provider registered afterwards through `/admin/providers` never took effect for the rest of that process's life, unlike every other agent's client (which is refreshed live). `resolveThemeProvider` is now called fresh on every request; `SkinGeneratorLike` gains `isAvailable()` so `GET /api/theme`'s `aiAvailable` reflects the live state instead of a snapshot.
  2. Provider *choice* was a hardcoded `{preferred: 'anthropic', fallback: 'openai'}` guess, duplicating — and never actually reading — the "Cogenta Theme Creator" agent's own admin-configurable `model.preferred`/`model.fallback`. An admin who repointed that agent at a different provider from its own settings screen saw the theme generator keep ignoring the choice. The theme generator and `theme.propose_theme` now both read that agent's live declaration (`THEME_CREATOR_AGENT_NAME`, newly exported from `@cogenta/agents`), falling back to the old hardcoded pair only when no agent record exists (a bare `Site` built by hand, tests included).
  
  `ProposeThemeToolOptions.resolveProvider` replaces the old fixed `client`/`model` fields for the same reason — resolved on every `execute()`, not once at tool-registration time.

### Patch Changes

- Updated dependencies [[`b85ce4e`](https://github.com/cogenta-cms/cogenta/commit/b85ce4edad72ff065cd63c852a9f42aeefc5ab9a), [`9da8702`](https://github.com/cogenta-cms/cogenta/commit/9da8702147864416ea2c27f47dd534444999d9da), [`0c42a6e`](https://github.com/cogenta-cms/cogenta/commit/0c42a6e1459d03f16c281befb36889c3ecac8e7c), [`bde02b5`](https://github.com/cogenta-cms/cogenta/commit/bde02b518f98a8d4cbc58544ea809c658b8dee7b), [`06c6177`](https://github.com/cogenta-cms/cogenta/commit/06c61776844c6d2e2bf5bfca7a1425e32c7d2ed6), [`e421dde`](https://github.com/cogenta-cms/cogenta/commit/e421dde6162a8a8e81f5c4b95ef99efd6af69128), [`76c000f`](https://github.com/cogenta-cms/cogenta/commit/76c000f12a5200d0664cc904bf52b90343da0768), [`df06c56`](https://github.com/cogenta-cms/cogenta/commit/df06c56cf17b17fe7a636e03e712698d895e5db4)]:
  - @cogenta/core@0.6.0
  - @cogenta/agents@0.4.0

## 0.2.0

### Minor Changes

- 257486e: L24 task 2: a third catalogue agent, "Cogenta Developer" (`developerAgent`,
  `packages/agents-builtin/src/developer/`), dedicated to extending Cogenta's own
  codebase at a site operator's request — not a site's content or theme, the CMS
  itself. Same shape as `content`/`performance`/`security`/`seo`: an `AgentDeclaration`
  built with `defineAgent`, an `identity.md` describing its role in depth, exported
  from the package index like its siblings, never auto-registered into any live
  site's `AgentDeclarationStore` (nothing in this package is — see the comment on
  `developerAgent` for why that already makes it "disabled by default" in the only
  sense that applies to a catalogue entry).
  
  Its identity document is deliberately long and project-specific rather than a
  generic "coding agent" prompt: it names the five interface contracts and what each
  forbids without an RFC/ADR, walks through R1-R10 with a concrete violation drawn
  from this codebase for each, maps every `packages/*` directory to what it owns, and
  restates the project's test discipline, commit format and documentation governance
  verbatim.
  
  Its only side-effecting tool, `code.propose_patch` (new permission `code.patch`,
  Contract C moves to `tools@1.3` — `docs/04-contrats.md`, additive by the bottom like
  `tools@1.1`/`tools@1.2` before it, no existing tool signature touched), opens a pull
  request carrying the full content of one or more changed files — it never writes to
  the repository directly. Built the same way `security`'s `deps.patch` already is,
  reusing the same `PrClient` capability rather than inventing a second "reach a
  forge" abstraction; only the input shape is new (arbitrary files instead of one
  dependency-file bump). `developerAgent.autonomy` pins `default: 'propose'` with no
  override, ever, for `code.propose_patch` — proven at runtime, not just declared: a
  new test builds the real manifest and autonomy wrapper (`buildManifest`,
  `withAutonomyForManifest`) and shows the call only ever queues an approval request,
  never reaches `PrClient.open`, and that a tool outside the agent's declared list
  (e.g. `content.publish`) never gets a manifest entry in the first place, so a
  prompt-injected request to call it has nothing to resolve against.
  
  No new dependency (R9): `code.propose_patch` is built with the same `defineTool`
  and `PrClient` interface `deps-patch-tool.ts` already exports.
  
  Alongside it, a fourth catalogue agent, "Cogenta Designer"
  (`designerAgent`, `packages/agents-builtin/src/designer/`), for theme and template
  work instead of the CMS's own code — its `identity.md` walks Contract D
  (`RenderContext`/`SkinTokens`/`ThemeManifest`/`renderChrome`) and Contract B (all
  twelve blocks, exact fields) in the same depth, names the zero-client-JS/zero-literal-color
  rules and the `light-dark()`/`oklch(from …)` technique the five shipped themes already
  use, and declares no write tool at all — no contract-C tool exists anywhere in this
  repo that writes a theme file, so `designerAgent.tools` stays read-only
  (`content.read`, `media.read`, `site.config_read`, `http.fetch`, `channel.send`,
  `build.trigger`) and `autonomy.default` is `propose` with nothing to override.

### Patch Changes

- Updated dependencies [154a751]
- Updated dependencies [5c5ffbd]
- Updated dependencies [08e394b]
- Updated dependencies [d0a3250]
- Updated dependencies [0e88f30]
- Updated dependencies [750a10b]
- Updated dependencies [08e394b]
- Updated dependencies [edd0787]
- Updated dependencies [c489fde]
- Updated dependencies [54ca689]
- Updated dependencies [23299e9]
- Updated dependencies [0692713]
- Updated dependencies [36744d3]
- Updated dependencies [af57fa2]
- Updated dependencies [322d1a3]
- Updated dependencies [0ca8a79]
- Updated dependencies [c392e24]
- Updated dependencies [562c9c1]
- Updated dependencies [edf5623]
- Updated dependencies [db307e0]
- Updated dependencies [49815b9]
- Updated dependencies [122da7a]
- Updated dependencies [2fb2101]
- Updated dependencies [0e90b32]
- Updated dependencies [d0bfa1d]
- Updated dependencies [95acedf]
- Updated dependencies [6e5df34]
- Updated dependencies [bebbab8]
- Updated dependencies [a8199ea]
- Updated dependencies [16f63f6]
- Updated dependencies [1dd9e6f]
- Updated dependencies [656163e]
- Updated dependencies [4513a71]
- Updated dependencies [bdcb563]
- Updated dependencies [3cbd6d7]
- Updated dependencies [249eb6f]
- Updated dependencies [4d3f3c7]
- Updated dependencies [cb62917]
- Updated dependencies [5e43b20]
- Updated dependencies [b8d307a]
- Updated dependencies [54409f3]
- Updated dependencies [2285720]
- Updated dependencies [9b1dae8]
- Updated dependencies [8a8d873]
- Updated dependencies [3075941]
- Updated dependencies [e01efae]
- Updated dependencies [5de237f]
- Updated dependencies [2c1af5d]
- Updated dependencies [745ebd8]
- Updated dependencies [960757d]
- Updated dependencies [835d736]
- Updated dependencies [cf005d4]
- Updated dependencies [07c0f0a]
  - @cogenta/core@0.5.0
  - @cogenta/agents@0.3.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff)]:
  - @cogenta/core@0.4.0
  - @cogenta/agents@0.2.1

## 0.1.3

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`809baee`](https://github.com/cogenta-cms/cogenta/commit/809baee0b47e48aea06235a97c0da29c7ba4b06c), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06), [`a332e41`](https://github.com/cogenta-cms/cogenta/commit/a332e416bfe08a226756451624b6344e7c6b7516), [`1f1e8b2`](https://github.com/cogenta-cms/cogenta/commit/1f1e8b24385750995bb2af90a8d94478d44bdcdc), [`ade7b38`](https://github.com/cogenta-cms/cogenta/commit/ade7b3807fd273e56bcbe7499eb83374a592d35f)]:
  - @cogenta/core@0.3.0
  - @cogenta/agents@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/agents@0.1.2

## 0.1.0

### Minor Changes

- [`fd66dbc`](https://github.com/cogenta-cms/cogenta/commit/fd66dbce1d2e674e62e13eaec488ae85ee745e32) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the Content agent: `createContentDraftTool` forces `provenance:
  generated|assisted` on every draft it writes — the input schema never
  offers a `provenance` field for the model to set, and `execute`
  overwrites anything smuggled into `values` under that key,
  unconditionally, on every call. `checkTerminology` scans text against
  the site's glossary for banned terms. `suggestTopicGaps` reuses the
  hashing-trick `EmbeddingProvider` (`@cogenta/agents`, L4 task 14) to
  find candidate topics unlike anything already published.
  `contentAgent` declares only `content.read`/`content.write_draft`/
  `media.read`/`agent.delegate` — no `content.publish`.

- [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the Performance agent: `queryCrux` measures Core Web Vitals via the
  Chrome UX Report API (real-user field data on the deployed site, no
  headless browser); `medianMetrics` combines several noisy samples
  before `compareToBudget` or `detectRegression` ever run
  (`detectRegression`'s default 15% threshold is deliberately generous,
  so normal field-data jitter never gets reported as a regression);
  `diagnosePerformanceRisks` flags only structurally-derivable causes
  (missing image dimensions, unoptimized images, too many third-party
  scripts) — it does not guess at causes it cannot back with data.
  `performanceAgent` ties it together with the lot's tool list
  (`http.fetch`/`content.read`/`channel.send`/`build.trigger` — no
  content-writing tools).
  
  One new `@cogenta/core` error code: `PERFORMANCE_CRUX_QUERY_FAILED`.

- [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the `deps.scan` tool: SBOM → OSV.dev correlation (only versions
  genuinely installed and affected, matched by OSV's own query semantics)
  → EPSS lookup → exploitability assessment crossing CVSS and EPSS →
  imposed-format security report (what's affected / what an attacker
  could do / is the site exposed / what's proposed / what happens if
  nothing is done).
  
  Two new `@cogenta/core` error codes: `SECURITY_OSV_QUERY_FAILED` and
  `SECURITY_EPSS_QUERY_FAILED`.

- [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `deps.patch` (opens a pull request bumping one dependency to a fixed
  version — never modifies anything directly; `revert` closes the PR
  without merging) and `securityAgent`, the frozen `AgentDeclaration`
  tying `deps.scan`/`deps.patch` together with the lot's default autonomy
  (`deps.scan` autonomous, `deps.patch` proposed).
  
  One new `@cogenta/core` error code: `SECURITY_DEPENDENCY_NOT_FOUND`.

- [`6fa45e8`](https://github.com/cogenta-cms/cogenta/commit/6fa45e820eeb7c6d34a57755688dbbdb2abec471) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the second half of the SEO agent: `buildArticleJsonLd`/`validateJsonLd`
  (schema.org generation and verification), `proposeInternalLinks` and
  `detectCannibalization` (topical similarity via the RAG hashing
  embedding provider), `findOrphanedRedirects` (chain-aware, cycle-safe),
  and `validateLlmsTxt` (the AEO/GEO `llms.txt` shape check).

### Patch Changes

- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`bcf646e`](https://github.com/cogenta-cms/cogenta/commit/bcf646edfd9810a977161075e639bce760b91864), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`67d188f`](https://github.com/cogenta-cms/cogenta/commit/67d188fb8d3cc7525299f462b2308e9e24e3c12f), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/agents@0.1.0
