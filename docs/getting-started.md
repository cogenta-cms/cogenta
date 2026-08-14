# Getting started

A working Cogenta site, from nothing to a first edit. This is developer-facing
technical documentation — see [`docs/00-vision.md`](00-vision.md) for why Cogenta
exists, or [`docs/lots/`](lots/) for the detailed design behind any of the commands
below.

Every code block on this page is a literal copy of a real, type-checked file under
[`examples/getting-started/`](../examples/getting-started/). `scripts/check-docs-examples.mjs`
compares them on every CI run and fails loudly if they ever drift — see that script's
header comment for why.

## Prerequisites

- **Node 22.11 or later** (22.13+ if you want Node's built-in SQLite — the zero-config
  default). `npm create cogenta` checks this for you and tells you exactly what to
  upgrade if it's missing.
- **pnpm, npm or yarn.** Examples below use `npm`; any of the three works.
- No database, no Redis, no Docker required to get started — SQLite and in-process
  drivers are the default (rule R1: nothing external is required).

## 1. Scaffold a site

```sh
npm create cogenta my-site
```

This runs an interactive wizard: site name, site URL, primary language, a site type
("blank" or "blog" — more blueprints are coming), a database (SQLite unless it detects
a local Postgres or MySQL), an optional LLM provider, and an admin email. Answer the
prompts, or skip them entirely:

```sh
npm create cogenta my-site -- --yes
```

`--yes` accepts every default and finishes in well under a minute — no external
service, no network call beyond an optional LLM key validation. For scripted installs,
`--config <file>` reads the same answers from a JSON file instead of prompting.

What you get, at minimum:

- `cogenta.config.mjs` — your site's configuration (below).
- `package.json` — declares `@cogenta/core`, `@cogenta/cli` and `@cogenta/theme-canonical`.
- `.cogenta/site.db` — a real SQLite database, already migrated.
- An admin user, created for you.

Choosing the `blog` site type additionally writes `cogenta.schema.mjs` (a real content
model — posts, categories, tags, pages), seeds demo content through it, and applies the
canonical theme's default skin.

## 2. `cogenta.config.mjs`

The wizard writes a plain `.mjs` file rather than routing through TypeScript's
`defineConfig()` — a `.ts` config needs Node 22.18+ to strip types at import time, and
the installer's own under-a-minute promise shouldn't require a newer Node than it
already asked for. If you write your own config by hand instead (for example while
developing Cogenta itself, or when TypeScript checking of the config file matters to
you), use `defineConfig()`:

<!-- embed:examples/getting-started/src/cogenta.config.ts -->
```ts
import { defineConfig } from '@cogenta/core'

export default defineConfig({
  site: {
    name: 'My site',
    url: 'https://example.com',
    locales: ['en'],
    defaultLocale: 'en',
  },
  database: {
    driver: 'sqlite',
    url: './.cogenta/site.db',
  },
})
```

`defineConfig()` is an identity function — its only job is editor completion and
compile-time checking. Secrets never belong here: an API key or signing key in this
file is rejected at startup (rule R7). Set `COGENTA_*` environment variables instead;
`cogenta doctor` (below) tells you exactly which ones a given setup needs.

## 3. Your content model — `cogenta.schema.ts`

A collection is declared with `defineCollection()` from `@cogenta/schema`, using the
`f.*` field builders. Every field is checked eagerly, at import time — a typo in a
relation's target, an empty `select`, a routing pattern that references a field you
never declared: all of these fail before you ever run a migration, not after.

<!-- embed:examples/getting-started/src/cogenta.schema.ts -->
```ts
import { defineCollection, f, validateCollectionSet } from '@cogenta/schema'

export const note = defineCollection({
  name: 'note',
  labels: { singular: 'Note', plural: 'Notes' },
  routing: { pattern: '/notes/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    body: f.richText({ required: true }),
  },
  indexes: [['slug']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

validateCollectionSet([note])

export default [note]
```

`validateCollectionSet()` runs the checks a single collection can't make on its own —
today just "does every relation's target actually exist" — across the whole set. Export
the array as the file's default export; `cogenta migrate up` and `cogenta serve` both
load it from `cogenta.schema.ts` (or `.mts`/`.mjs`/`.js`) next to your config.

Every entry in a collection also carries Cogenta's fixed system fields —
`id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `status`, `locale`,
`translationOf`, `version`, `provenance`, `provenanceDetail` — automatically. A
collection may never redeclare one of these names; `defineCollection()` rejects it if
it tries.

## 4. Run it

```sh
cd my-site
npx cogenta migrate up      # applies any schema changes since the last run
npx cogenta serve           # serves the content and auth API over HTTP
```

`serve` accepts `--port <n>` (default 4000) and `--host <host>` (default 127.0.0.1).

At any point, check the health of your setup:

```sh
npx cogenta doctor
```

`doctor` reports which driver is actually running for each need (database, cache,
queue, storage) and why — including when a preferred driver (Redis, S3, …) wasn't
found and Cogenta degraded to a local implementation on purpose. If something in your
config is wrong, `doctor` names the exact field, never a stack trace.

## 5. A first real edit

Add a second field to the `note` collection above — say, a `tags` field:

```ts
tags: f.relation({ to: 'tag', many: true, onDelete: 'cascade' }),
```

(this needs a `tag` collection to point at — see `post`/`tag` in
[`packages/create-cogenta/src/blueprints/blog.ts`](../packages/create-cogenta/src/blueprints/blog.ts)
for a complete worked example with a real relation). Save the file, then:

```sh
npx cogenta migrate up
```

The new column exists on the next request — no separate "generate migration" step for
an additive change like this one.

## Where to go next

- [`docs/lots/`](lots/) — the full design behind every command above, lot by lot.
- [`docs/04-contrats.md`](04-contrats.md) — the four versioned interface contracts
  (schema, blocks, tools, theme) that a collection, a block, an agent tool or a theme
  must honour.
- [`README.md`](../README.md) — project status and design principles.
