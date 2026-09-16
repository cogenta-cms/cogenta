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

This file is real — it's `examples/plugin-starter/plugin.manifest.json`, unmodified.
Save it as `plugin.manifest.json` (or `.ts`/`.mts`/`.js` — `loadPlugin` checks those four
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
(`packages/plugins/src/host/worker-runner.ts`) — takes this file's content, which
`readPluginCode` reads from the path the manifest's `main` names, and real host-side capability handlers (`createContentReadHandler`,
`createStorageWriteHandler`, …, `packages/plugins/src/host/capabilities.ts`); it resolves
the actually-granted capability list itself from your manifest and the real grant store,
runs the code in the isolated worker, and returns the JSON-serialized result.

**Your code lives in a file, and the host calls it by name (L31).** The manifest's
`main` names that file (`plugin.js` by default), `readPluginCode` reads it, and the
script's completion value is the set of handlers your plugin exposes:

```js
;({
  greet: async (input) => `hello ${input.name}`,
})
```

The host then calls exactly one of them, with a payload that travels as structured data
through the worker protocol (`invoke` and `input`, `packages/plugins/src/host/protocol.ts`)
— never by building a code string per call, which is how an escaping bug ends up inside
your own sandbox. By hand:

```bash
cogenta plugin run @example/plugin-starter --invoke greet --input '{"name":"Ada"}'
```

A plugin that exposes no handler of that name fails by name; a script that names no
handler at all still works exactly as before, its completion value being the result.

**A signature covers your code, not only your manifest.** `signPlugin(manifest, digest,
key)` signs both, and changing one character of the entry file invalidates it.

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

## Reacting to what happens on the site (L31)

A plugin subscribes to content lifecycle events in its manifest, and exposes one
handler named `onContentEvent`:

```json
{ "provides": { "eventSubscriptions": ["content.publish"] } }
```

```js
// plugin.js
;({
  onContentEvent: async (event) => {
    // event: { event, collection, id, locale, status, url, occurredAt… }
  },
})
```

The three events are `content.publish`, `content.unpublish` and `content.delete` — the
same closed set the site's outbound webhooks use, and subscribing to anything else is
refused when the manifest is validated. They carry identity and location, never the
content body: read what you need through a granted `content.read`.

An event fires after the write has landed, and a plugin can never break it: one that
throws, times out or has been disabled is logged and skipped, and the publish that
triggered it stays published. A plugin that exceeds its time or memory budget is
disabled until a human re-enables it — an event handler is not a place to do slow work.

Your code is read once, when the site starts: editing a plugin means restarting the
site, the same rule its schema file already follows.

## What your plugin can actually do today (L31)

Nine capabilities have a real implementation behind them:

| Capability | What the SDK gives you |
|---|---|
| `content.read` | `sdk.content.read({ id })` — one published entry |
| `content.write_draft` | `sdk.content.write_draft({ collection, id?, values })` — creates or updates a **draft**, never publishes |
| `content.publish` | `sdk.content.publish({ collection, id })` |
| `content.delete` | `sdk.content.delete({ collection, id })` — to the trash, reversible |
| `media.read` | `sdk.media.read({ id })` — a media item's metadata, never its bytes |
| `schema.read` | `sdk.schema.read({})` — the site's collections and their fields |
| `http.fetch` | `sdk.http.fetch({ url })`, only on the hostnames granted |
| `storage.read` / `storage.write` | your own prefix, re-checked per call |

The four content capabilities may name a collection — `content.write_draft:article` writes
drafts of articles and nothing else, while the bare form means every collection. Ask for
the narrower one: it is the one a reviewer can say yes to quickly.

The rest of the vocabulary (`media.write`, `site.config_*`, `deps.*`, `build.trigger`,
`deploy.trigger`, `channel.send`, `agent.delegate`, `memory.*`) is still declarable —
the names come from contract C and describe real intentions — but **nothing implements
them yet**, so `cogenta plugin grant` refuses them rather than handing you a method that
does nothing.

## Serving a page of your own (L31)

Declare the paths you serve, and expose `onRequest`:

```json
{ "provides": { "routes": ["/hello"] } }
```

```js
// plugin.js
;({
  onRequest: (request) => ({
    status: 200,
    contentType: 'text/html',
    body: `<p>Hello ${request.query.name ?? ''}</p>`,
  }),
})
```

It is served at `/_cogenta/plugins/<your plugin name>/hello`, a reserved prefix: a plugin
never shadows one of the site's pages, and a page never shadows a plugin. `request`
carries `method` (GET or POST), `path`, `query` and `body` (text, capped at 64 KiB).

You answer with a status, one content type from a known list (`text/plain`, `text/html`,
`application/json`, `application/xml`, `text/csv`) and a body — **never a header**. A
plugin that could set headers could set a cookie on the site's own origin or turn its
answer into a download; the host adds `cache-control: no-store` and nothing else. A path
your manifest did not declare is a plain 404, and a handler that throws is a 500 whose
body says nothing about your error (it is logged instead).

## Work on a cadence (L31)

```json
{ "provides": { "schedules": [{ "name": "daily-digest", "everyMinutes": 1440 }] } }
```

```js
// plugin.js
;({ onSchedule: async ({ name }) => `sent the ${name}` })
```

Each entry becomes a real task on the site's own scheduler, named
`plugin:<your plugin>:<schedule>`: it runs on the same tick, takes the same
multi-replica claim, shows on the "Tâches planifiées" screen, and can be run by hand
from there. The string you return is the summary that screen shows. Five minutes is the
shortest cadence, because nothing here is a durable worker (R1) — a task runs when a
tick finds it due.

## The manifest is data, never code (L31 step 5)

`plugin.manifest.json` is a JSON object. It used to be a JavaScript module the host
imported, which meant a manifest was arbitrary code running in the host process: every
boot executed one per installed plugin, and *inspecting* a plugin in the workshop ran it
too, before any signature or capability check. A security review of 2026-09-16 found it,
with a working proof; the loader now reads and parses, and refuses a `plugin.manifest.mjs`
by name.

`definePlugin` still exists for writing and validating one; what ships is the JSON.

## Where a plugin lives on a site (L31)

One directory per plugin under `plugins/` at the root of the site, each holding its
`plugin.manifest.*` and the file its `main` names:

```
mon-site/
  cogenta.config.mjs
  plugins/
    mon-plugin/
      plugin.manifest.json
      plugin.js
```

`plugins.dir` moves that directory and `plugins.enabled: false` stops a site loading any
of them at all. The CLI is the hand path onto all of it:

```bash
cogenta plugin list                       # what this site has installed
cogenta plugin check mon-plugin           # its manifest validates, its code reads
cogenta plugin grant mon-plugin content.read
cogenta plugin run mon-plugin --invoke greet --input '{"name":"Ada"}'
```

A capability only ever reaches the sandbox through a real grant row: there is no flag
that hands a plugin a capability for one run, and `grant` refuses a capability the
manifest never requested.

## Adding a block to a page, and a widget to an area (L32)

This is the one people ask for first: *my plugin should let an editor put something new on
a page.* It can.

### The rule that makes it safe

A block your plugin provides **never joins contract B's frozen vocabulary**. It is
registered beside it, and it declares a `fallback` — a vocabulary block to draw in its
place when your plugin is not there. That is what stops a plugin from taking a page
hostage: uninstall it and the page degrades, it does not empty.

Because your block's data will not satisfy the fallback's own schema, the manifest also
says where the fallback's fields come from. Without that map, "it falls back to `quote`"
would mean "it disappears".

```json
"provides": {
  "blocks": [
    {
      "name": "callout",
      "label": "Encadré",
      "fallback": "quote",
      "fields": {
        "message": { "kind": "text", "required": true, "label": "Message" },
        "tone": { "kind": "select", "options": { "options": ["info", "warning"] } }
      },
      "fallbackFrom": { "text": "message" }
    }
  ],
  "widgets": [
    {
      "name": "keyFigure",
      "label": "Chiffre clé",
      "fields": {
        "value": { "kind": "text", "required": true, "label": "Chiffre" },
        "caption": { "kind": "text", "required": true, "label": "Légende" }
      }
    }
  ]
}
```

A field's `kind` is one of contract B's own (`text`, `richText`, `number`, `boolean`,
`media`, `relation`, `select`, `color`, `json`) plus `list`, a repeating group whose `of`
says what one item holds. `label` is what the person filling it in reads, so write it in
their language rather than leaving them with `leftLabel`.

A **widget** declares no fallback, on purpose: a widget is chrome, not content. One that
cannot render is simply not drawn, its settings stay in the database, and reinstalling the
plugin brings it back exactly as it was.

### Rendering it

Two handlers, and they return a **tree** — never a string of HTML:

```js
const el = (tag, attrs, children) => ({ kind: 'element', tag, attrs: attrs ?? {}, children: children ?? [] })
const txt = (value) => ({ kind: 'text', value: String(value ?? '') })

;({
  onRenderBlock: (input) =>
    el('aside', { class: `cg-callout cg-callout--${input.values.tone ?? 'info'}` }, [
      el('p', {}, [txt(input.values.message)]),
    ]),

  onRenderWidget: (input) =>
    el('div', { class: 'cg-key-figure' }, [
      el('strong', {}, [txt(input.values.value)]),
      txt(' '),
      el('span', {}, [txt(input.values.caption)]),
    ]),
})
```

`input.values` holds exactly the fields you declared, plus `input.locale`. Rendering needs
no capability at all — a block that only draws what a person typed asks for nothing.

### What the host will refuse

Your tree is checked before it reaches a page, and a block that fails the check is
**dropped in favour of its fallback** rather than repaired:

- tags outside a structural allowlist — no `script`, `style`, `iframe`, `object`, `link`,
  and no form controls;
- attributes outside an allowlist — `class` yes, `id` no (a duplicate id breaks a page's
  own anchors), and nothing starting with `on`;
- `href`/`src`/`poster` pointing at `javascript:` or a non-image `data:`;
- more than 24 levels of nesting, 2000 nodes, or 100 000 characters of text.

There is no way to emit raw markup, by construction: the tree has no escape hatch, and a
string in a text node is escaped when it is serialised.

### What it costs

Your handler runs in a **separate process under Node's permission model** — no filesystem,
no `child_process`, an empty environment — and the result is cached against your plugin,
its version, the block's stored values and the locale. Editing the block changes the cache
key, so a stale render cannot survive an edit; a busy page does not fork a process per
visit.

### Styling it

A block nobody can style is half a feature, so a plugin may ship a stylesheet:

```json
"provides": { "styles": "styles.css" }
```

Static CSS from your package, read once, checked, and served from the site's own origin at
`/_cogenta/plugins/<your-name>/styles.css` — linked from every themed page, cached under
the file's own digest. Style **your own classes**, and take colours from the theme's custom
properties rather than hard-coding them, so the same block looks at home in a light theme,
a dark one, and whatever palette the site's owner picked.

What the host refuses, whole rather than edited — a refused stylesheet is not served and
your markup renders unstyled:

- `@import`: a stylesheet that pulls in another is one the host never read;
- **any `url()` that is not an inline `data:image/`** — including a same-site path. A remote
  URL in a selector is how CSS becomes an exfiltration channel ("if this attribute is
  present, fetch this"); a stylesheet that cannot fetch cannot do it;
- `expression(`, `behavior:`, `-moz-binding`, `javascript:`, or markup.

Comments are stripped before any of that is looked for, so a stylesheet may *document* the
rules it follows. `checkPluginStylesheet` is exported from `@cogenta/plugins`: run the
host's own function in your plugin's test rather than a copy of its rules.

### What happens when your plugin is uninstalled

The site remembers what each plugin declared. Remove the plugin and the pages that used its
blocks **degrade rather than empty**: the block still validates, an editor can still save
the page, and the fallback you named is drawn with the fields `fallbackFrom` maps. Reinstall
and the real block comes back with its data untouched. A widget, having no fallback, simply
stops being drawn until then.

### And in the admin

Nothing to do. `GET /api/plugins/blocks` and `/api/plugins/widgets` tell the admin what you
declared; your block appears in the page builder's insertion panel (searchable by label and
by type name), your widget in the library under « Extensions », and both get a settings form
generated from the fields you declared, with the labels you wrote.

## The starter template

[`examples/plugin-starter/`](../examples/plugin-starter/) is a real, minimal, tested
plugin package — copy it as a starting point. Its own test suite
(`examples/plugin-starter/test/manifest.test.ts` and `test/runtime.test.ts`) proves, for
real: the manifest passes
`definePlugin`'s validation, the entry code actually runs inside the real isolated
sandbox and returns the real content it reads, and the block and widget it provides render
the exact trees this guide shows. If either ever breaks, CI fails — the
same "cannot rot" guarantee this project holds every other documented example to.
