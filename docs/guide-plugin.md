# Writing a Cogenta plugin

This is developer-facing documentation for someone building a **third-party plugin** —
the extension surface `@cogenta/plugins` provides, not the core CMS itself (see
[`getting-started.md`](getting-started.md) for that). Every concrete claim below —
function names, capability strings, manifest shape — is verified against the real code
in `packages/plugins/src/`, not the illustrative sketch in
[`docs/lots/L7-extensibilite.md`](lots/L7-extensibilite.md); where the two differ, this
guide follows the real code. A real, working starter package lives at
[`examples/plugin-starter/`](../examples/plugin-starter/) — its own test suite proves
every claim below actually runs, the same "cannot rot" guarantee
[`getting-started.md`](getting-started.md) established for the core CMS.

## Why plugins work the way they do

90% of WordPress compromises go through a plugin. Cogenta's answer is not "trust the
plugin author" — it's **structural containment**: a plugin never runs with the host's
privileges, only with the exact, narrow set of capabilities a human explicitly approved,
and anything not approved isn't merely refused when called — it doesn't exist on the
object your code has access to. Understanding that property (`sdk.content` might not
exist at all) is more useful to an author than memorizing the mechanism, but the
mechanism is real too: your plugin's code runs inside a `node:vm` sandbox, itself inside
a separate `worker_threads.Worker` spawned with an empty environment. It never sees
`fs`, `net`, `process`, or any host environment variable or secret — not because they
were removed, but because they were never given to it. `eval`/`new Function` are
blocked at the V8 level, and dynamic `import()` is refused natively. This is
`packages/plugins/src/guest/sandbox-entry.mjs`, and it's short enough to read yourself.

## The manifest

Every plugin exports a validated manifest, built with `definePlugin`
(`packages/plugins/src/manifest.ts`):

```js
import { definePlugin } from '@cogenta/plugins'

export default definePlugin({
  name: '@example/plugin-starter',
  version: '1.0.0',
  engine: '^1.0.0',

  capabilities: [
    'content.read',
    'storage.read:plugins/plugin-starter',
    'storage.write:plugins/plugin-starter',
  ],

  provides: {
    tools: ['plugin-starter.hello'],
  },

  runtime: 'server',
  isolated: true,
})
```

This file is real — it's `examples/plugin-starter/plugin.manifest.mjs`, unmodified.
Save it as `plugin.manifest.mjs` (or `.ts`/`.mts`/`.js` — `loadPlugin` checks those four
names in that order, `packages/plugins/src/loader.ts`) at the root of your plugin
package, exactly the way a site's own `cogenta.config.mjs` is loaded — a plugin manifest
is a user-authored file, not a registry entry format.

`definePlugin` collects every problem and reports them all at once — fix the whole list
in one pass, not one refusal at a time. Four rules are hard refusals, always:

- `http.fetch` needs an explicit domain — `http.fetch:api.example.com`, never a bare
  `http.fetch` and never `http.fetch:*`.
- `storage.read`/`storage.write` must stay inside your own prefix,
  `plugins/<your-package-name-without-scope>/…` — `storage.write:plugins/plugin-starter`
  is fine for a plugin named `@example/plugin-starter`; anything outside that prefix is
  refused.
- An unknown capability name is refused — see the full real vocabulary below.
- A block your plugin provides (`provides.blocks`) needs a `fallback`: `{name, fallback}`,
  where `fallback` names the vocabulary block (e.g. `prose`) a renderer falls back to
  if your block is unrecognised or your plugin is disabled. A block without one is
  refused at definition time, not caught later when a renderer trips on it.

`provides` also accepts `fields`, `channels`, `drivers`, `skills`, and
`eventSubscriptions` — real slots beyond the four shown above, matching what
"## Ce qu'un plugin peut apporter" (the lot doc) names as legitimate things a plugin can
bring. A plugin providing nothing new (a pure consumer of the SDK) is a legitimate,
empty `provides: {}`.

## The capability vocabulary

This is the complete, real list (`PLUGIN_CAPABILITY_NAMES`,
`packages/plugins/src/manifest.ts`) — every name here, and only these, may appear in
`capabilities`. The sentence in the second column is exactly what the user approving
your plugin will see (`describeCapability`, `packages/plugins/src/permissions/describe.ts`)
— never the raw string:

| Capability | What the user sees | Risk |
|---|---|---|
| `content.read` | « Ce plugin pourra lire le contenu du site. » | low |
| `content.write_draft` | « … créer et modifier des brouillons, mais pas publier. » | low |
| `content.publish` | « … publier du contenu directement, sans validation humaine préalable. » | high |
| `content.delete` | « … supprimer du contenu du site. » | high |
| `media.read` | « … consulter les images et fichiers du site. » | low |
| `media.write` | « … ajouter ou modifier des images et fichiers. » | medium |
| `schema.read` | « … consulter la structure du contenu. » | low |
| `site.config_read` | « … consulter les réglages du site. » | low |
| `site.config_write` | « … modifier les réglages du site. » | high |
| `deps.scan` | « … analyser les dépendances à la recherche de failles connues. » | low |
| `deps.patch` | « … proposer des corrections de dépendances, à valider. » | medium |
| `build.trigger` | « … déclencher une reconstruction du site. » | medium |
| `deploy.trigger` | « … déclencher une mise en ligne du site. » | high |
| `http.fetch:<domain>` | « … envoyer des données à `<domain>`. » | medium |
| `storage.read:<prefix>` | « … lire les fichiers qu'il a lui-même stockés. » | low |
| `storage.write:<prefix>` | « … créer ou modifier les fichiers qu'il stocke. » | medium |
| `channel.send:<channel>` | « … envoyer des messages sur le canal `<channel>`. » | medium |
| `agent.delegate` | « … déléguer des tâches à un agent du site. » | high |
| `memory.read` | « … consulter la mémoire des agents. » | medium |
| `memory.write` | « … modifier la mémoire des agents. » | high |

**Ask for the narrowest set your plugin actually needs.** Every capability you declare
is a real, separate approval prompt a real human has to read. This isn't just etiquette
— it's the lot's own named pitfall: "Le SDK devient une API publique. Tout ce qu'on y
expose devient impossible à retirer. Commencer minimal." The same applies to what you
ask for: a broad request today is a promise you can't easily walk back later.

## Calling the SDK from your plugin's code

There is no `import` inside the sandbox and no module system — your plugin's runtime
code is a plain **classic script** (not an ES module: no top-level `await`, wrap async
work in an IIFE and make its returned promise the script's final expression), executed
directly (`vm.Script`), with one real global your code can use: `sdk`. `sdk`'s shape is
built dynamically from exactly what was granted — a capability you declared but that
hasn't been (or is no longer) granted is not a method that throws when called, it's a
key that **does not exist**:

```js
'content' in sdk           // false if content.read was never granted
'read' in (sdk.content ?? {})
```

Write your code defensively around that, since a user can revoke a previously-granted
capability at any time (`packages/plugins/src/permissions/review.ts`) — your plugin
should degrade gracefully, not assume every capability it once had is still there.

`examples/plugin-starter/plugin.js` is the real runtime code the starter template ships
— read it directly, it's short:

```js
;(async () => {
  const entry = await sdk.content.read({ id: 'welcome' })
  await sdk.storage.write({
    key: 'plugins/plugin-starter/last-run.json',
    content: JSON.stringify({ ranAt: new Date().toISOString(), readTitle: entry?.title ?? null }),
  })
  return `Hello from @example/plugin-starter — read "${entry?.title ?? 'nothing'}".`
})()
```

`runPlugin(manifest, code, grants, options)` — the real, non-bypassable entry point
(`packages/plugins/src/host/worker-runner.ts`) — takes this file's content as a plain
string and real host-side capability handlers (`createContentReadHandler`,
`createStorageWriteHandler`, …, `packages/plugins/src/host/capabilities.ts`); it resolves
the actually-granted capability list itself from your manifest and the real grant store,
runs the code in the isolated worker, and returns the JSON-serialized result.

**There is no argument-passing channel yet.** The message protocol between host and
worker (`packages/plugins/src/host/protocol.ts`) carries a `code` string and nothing
else — no separate `args` field, and no convention yet for a host to automatically read
a plugin's entry file and inject per-call parameters into it. Today, a real integration
either runs a fixed script (as the starter does), or a caller builds the exact code
string per invocation on the host side, substituting real values with `JSON.stringify`
(never raw concatenation — that's how you'd introduce a string-escaping bug into your
own sandboxed code) — see `@cogenta/plugins`'s own `test/host/sdk.test.ts` for that
pattern. A safer, structured argument channel doesn't exist yet; expect it to improve.

Every SDK call is re-verified host-side against the *specific* request, not just "was
this capability name granted at all" (`packages/plugins/src/host/capabilities.ts`) — a
plugin granted `http.fetch:api.example.com` genuinely cannot make its own SDK call
reach `evil.example.com`, and `storage.read`/`storage.write` reject any key containing
a `.`/`..` segment. You don't need to (and can't) work around this from inside your
plugin — it's enforced on the other side of the message boundary, where your code has
no reach.

## Limits, and what happens if you cross them

Your plugin's code runs with a real timeout and a real V8 heap ceiling
(`packages/plugins/src/host/worker-runner.ts`). Crossing either doesn't just fail that
one call — it **disables your plugin** for every future run, with an alert, until a
human explicitly re-enables it (`PLUGIN_DISABLED`,
`packages/plugins/src/permissions/disabled.ts`). Design accordingly: no unbounded
loops, no unbounded in-memory accumulation, and if a real workload is naturally
long-running, prefer many small calls over one call that tries to do everything.

## Publishing: signing and the registries

A plugin published to an official registry must be **signed** — Ed25519, via
`packages/plugins/src/signing/`. A missing or invalid signature blocks loading with no
override anywhere in the code — there is deliberately no escape hatch. Installing from
a local path or a git checkout is allowed without a signature ("development mode"), but
carries a permanent warning once an admin surface renders it.

Four registries exist, each with different requirements (`packages/plugins/src/registries/`)
— pick the one that matches what you're actually publishing:

| You're publishing | Registry | Gate |
|---|---|---|
| A code plugin | `createPluginRegistry` | signature **and** a valid manifest **and** human review |
| A theme | `createThemeRegistry` | signature **and** contract D verified (`verifyTheme`) |
| Instructions/resources for an agent | `createSkillRegistry` | parses as a valid skill file, then human review |
| A tokens.json skin | `createSkinGallery` | automatic only — contrast/scale/completeness, no human review |

A submission that fails an automatic gate never reaches human review — it's rejected
immediately with the real, specific reason. Where human review applies, re-reviewing an
already-decided submission returns its prior decision rather than silently re-deciding
or throwing a raw error.

## Updates: a new capability is never auto-granted

If a later version of your plugin declares a capability the current one doesn't, that
capability is **not** automatically available to the new version just because the
plugin as a whole was already installed and trusted
(`packages/plugins/src/permissions/resolve.ts`'s `resolveGrantedCapabilities` — the
intersection of what's declared and what's actually been granted, by exact string,
always). Your new version can install and run, but the new capability's SDK method
stays absent until a human explicitly approves it. Don't assume a permission bump
takes effect immediately — write your plugin so the absence of a not-yet-approved
capability degrades gracefully rather than crashing.

## The starter template

[`examples/plugin-starter/`](../examples/plugin-starter/) is a real, minimal, tested
plugin package — copy it as a starting point. Its own test suite
(`examples/plugin-starter/test/manifest.test.ts` and `test/runtime.test.ts`) proves, for
real: the manifest passes
`definePlugin`'s validation, and the entry code actually runs inside the real isolated
worker and returns the real content it reads. If either ever breaks, CI fails — the
same "cannot rot" guarantee this project holds every other documented example to.
