---
"@cogenta/agents-builtin": minor
---

L24 task 2: a third catalogue agent, "Cogenta Developer" (`developerAgent`,
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
