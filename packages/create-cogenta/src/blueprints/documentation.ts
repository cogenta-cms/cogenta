import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import { coverArt, type Palette } from '../demo-art/compositions.js'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  richTextParagraph,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import type { BlueprintMenus } from './menus.js'
import { STARTING_SKINS } from './starting-skins.js'

/**
 * The `documentation` blueprint's content model (L9 task 8, batch A;
 * rebuilt for L25 task Phase 1 — `theme-docs`): reference material, not
 * marketing — the "page types" are `doc_page` entries themselves (ordered,
 * grouped into sections), rather than a generic block-composed page for
 * each one. A single `page` entry (`home`) still exists so the site root
 * works and links into the docs, exactly like every other blueprint's
 * landing page.
 *
 * `body: f.blocks()`, not `f.richText()`: a doc page's own content is a
 * block zone like `page.blocks`, whose *first* block is always the
 * `collectionList` `@cogenta/theme-docs` reads as the left-hand sidebar
 * (`section`/`order`, plain fields — neither is a valid
 * `collectionList.sort.field`, so the theme groups and re-sorts the
 * already-fetched slice itself; see the theme's own `render-block.ts`).
 * Everything after that first block is ordinary prose.
 */

export const docPage = defineCollection({
  name: 'doc_page',
  labels: { singular: 'Doc page', plural: 'Doc pages' },
  routing: { pattern: '/docs/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    section: f.text({ required: true, max: 80 }),
    order: f.number({ required: true, integer: true, min: 0 }),
    body: f.blocks({ required: true }),
    ...SEO_FIELDS,
  },
  indexes: [['slug'], ['section']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const DOCUMENTATION_COLLECTIONS: readonly CollectionDefinition[] = [docPage, page]

validateCollectionSet(DOCUMENTATION_COLLECTIONS)

const BLOCK_VERSION = '1.0.0'

// --------------------------------------------------------------------------
// Rich-text helpers. Contract A's rich-text schema (`@cogenta/schema`,
// frozen) has no fenced "code block" node and no table — the closed
// vocabulary is `block` (styles `normal`/`h2`/`h3`/`h4`/`blockquote`, plus
// list items), `media` and `hr`. `codeBlock` below produces the one shape
// `@cogenta/theme-docs`'s `prose.ts` recognises and promotes to a real
// `<pre><code>` — a paragraph whose only span carries the `code` mark.
// Where the brief asks for "a table", a definition-style bullet list
// (`term — description`) is the honest equivalent this schema can express;
// see the CLI/config reference pages below.
// --------------------------------------------------------------------------

function heading(key: string, level: 'h2' | 'h3', text: string): RichTextDocument[number] {
  return {
    _key: key,
    _type: 'block',
    style: level,
    children: [{ _key: `${key}-span`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

function paragraph(key: string, text: string): RichTextDocument[number] {
  return {
    _key: key,
    _type: 'block',
    style: 'normal',
    children: [{ _key: `${key}-span`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

function codeBlock(key: string, code: string): RichTextDocument[number] {
  return {
    _key: key,
    _type: 'block',
    style: 'normal',
    children: [{ _key: `${key}-span`, _type: 'span', text: code, marks: ['code'] }],
    markDefs: [],
  }
}

function bulletList(keyPrefix: string, items: readonly string[]): RichTextDocument {
  return items.map((text, index) => ({
    _key: `${keyPrefix}-${index}`,
    _type: 'block' as const,
    style: 'normal' as const,
    listItem: 'bullet' as const,
    level: 1,
    children: [{ _key: `${keyPrefix}-${index}-span`, _type: 'span' as const, text, marks: [] }],
    markDefs: [],
  }))
}

function proseBlock(key: string, body: RichTextDocument): VocabularyBlock {
  return { _key: key, _type: 'prose', _version: BLOCK_VERSION, body } as VocabularyBlock
}

/** The sidebar `collectionList`, identical on every doc page — `@cogenta/theme-docs` detects it by being the page's own first block, on the `doc_page` collection. */
function sidebarBlock(key: string): VocabularyBlock {
  return {
    _key: key,
    _type: 'collectionList',
    _version: BLOCK_VERSION,
    collection: 'doc_page',
    sort: { field: 'createdAt', direction: 'asc' },
    limit: 100,
    layout: 'list',
  } as VocabularyBlock
}

export interface DocumentationDemoDocPage {
  readonly title: string
  readonly slug: string
  readonly section: 'Getting started' | 'Guides' | 'Reference'
  readonly order: number
  readonly body: RichTextDocument
}

/**
 * Ten real, technical doc pages across three sections — the exact shape the
 * brief asks for: headings, code blocks, lists, and (where a real table
 * would go) a definition-style list, credible enough to read as an actual
 * getting-started guide rather than placeholder copy.
 */
export const DOCUMENTATION_DEMO_DOC_PAGES: readonly DocumentationDemoDocPage[] = [
  {
    title: 'Introduction',
    slug: 'introduction',
    section: 'Getting started',
    order: 1,
    body: [
      paragraph(
        'intro-p1',
        'Cogenta is an agentic, open-source CMS: a runtime for content, a runtime for agents, and the wiring between them, in one project. Most content management systems bolt an "AI assistant" onto an otherwise ordinary editing screen. Cogenta starts from the other direction — the multi-agent runtime is part of the core, not a plugin, so a site can read its own traffic, propose a fix, and apply it once you say yes.',
      ),
      heading('intro-h1', 'h2', "What's in the box"),
      ...bulletList('intro-list', [
        'A schema-driven content model — collections, fields, permissions, versioning, drafts and a real trash can, not a soft flag.',
        'A theme layer with zero client JavaScript by default — every page you are reading right now is plain HTML and CSS, except for the one small script that remembers whether you prefer light or dark mode.',
        'A multi-agent runtime that can read, propose and — with your explicit consent — apply changes to the site: rewriting a broken redirect, drafting release notes, or flagging a page that has drifted out of date.',
        'A REST and GraphQL API generated from the same schema an editor sees in the admin — no second definition to keep in sync.',
      ]),
      paragraph(
        'intro-p2',
        'This site is itself a demo, scaffolded by create-cogenta from the "documentation" blueprint. Every page below is real, published content in a real database — edit it like any other entry, delete it, or add ten more sections next to it.',
      ),
      heading('intro-h2', 'h2', 'How this documentation is organised'),
      paragraph(
        'intro-p3',
        'Three sections, left to right in the sidebar: "Getting started" gets a new site running end to end, "Guides" covers the decisions you make once a site exists — deployment, content modelling, theming, plugins — and "Reference" is the material you come back to and skim rather than read start to finish: every CLI command, every configuration key, every HTTP endpoint.',
      ),
      paragraph(
        'intro-p4',
        'If you only read one more page, make it "Content model" — nearly everything else in Cogenta, from permissions to the theme layer to the agent runtime, is built on top of the same collection-and-field vocabulary it describes.',
      ),
    ],
  },
  {
    title: 'Installation',
    slug: 'installation',
    section: 'Getting started',
    order: 2,
    body: [
      paragraph('install-p1', 'A new site starts from one command:'),
      codeBlock('install-code1', 'npm create cogenta my-site\ncd my-site\nnpm run dev'),
      paragraph(
        'install-p1b',
        'The installer asks a short series of questions — site name, default language, database, and (optionally) a starting template — then writes a runnable project. Answer with defaults throughout and you still get a working site: every question has one.',
      ),
      heading('install-h1', 'h2', 'Requirements'),
      ...bulletList('install-req', [
        'Node.js — the current LTS or newer',
        'A database — SQLite (default, zero setup), PostgreSQL, or MySQL/MariaDB',
        'No other service is required to start — no Redis, no queue, no object storage; Cogenta degrades to a file-backed implementation of each until you configure the real thing',
      ]),
      heading('install-h2', 'h2', 'What gets created'),
      paragraph(
        'install-p2',
        'The installer writes a schema file (cogenta.schema.mjs), a starting skin, a .env with a freshly generated signing key, and — if you chose a template — demo content you can delete at any time. Nothing is published on your behalf: demo entries seeded by a template start as drafts unless the template says otherwise.',
      ),
      heading('install-h3', 'h2', 'Starting from a document instead'),
      paragraph(
        'install-p3',
        'The installer can also read a real brief — a product spec, a set of notes, a PDF — and propose a content model and a page plan from it. Nothing is written to disk until you accept each proposed piece individually; declining all of them leaves you with exactly the site the ordinary wizard would have produced.',
      ),
      heading('install-h4', 'h2', 'Troubleshooting a first run'),
      ...bulletList('install-trouble', [
        'SCHEMA_INVALID on first start — the schema file failed to load; run cogenta doctor to see which collection or field it rejected and why',
        'COGENTA_AUTH_SIGNING_KEY is not set — the .env file was not loaded; confirm it sits next to cogenta.config.mjs',
        'A blank homepage — most blueprints publish their landing page under the slug "home"; confirm at least one page entry with that slug is published',
      ]),
    ],
  },
  {
    title: 'Configuration',
    slug: 'configuration',
    section: 'Getting started',
    order: 3,
    body: [
      paragraph(
        'config-p1',
        'A site is configured by cogenta.config.mjs at the project root, loaded once at startup. There is deliberately no second place to configure a running site — no database table of settings that can drift from what is checked into version control alongside the code that depends on it.',
      ),
      codeBlock(
        'config-code1',
        "export default {\n  site: { name: 'My site', url: 'https://example.com' },\n  database: { driver: 'sqlite' },\n}",
      ),
      heading('config-h1', 'h2', 'Commonly changed options'),
      ...bulletList('config-list', [
        'site.name and site.url — used across SEO tags, the sitemap, and Open Graph metadata',
        'database.driver — sqlite, postgres, or mysql',
        'security.pageMaxAge — the public cache lifetime for a rendered page, in seconds',
        'security.cors — disabled by default; an explicit allow-list turns it on for a headless front end on another origin',
        'security.hstsMaxAge — off by default on purpose: a bad value here can lock visitors out of your site over plain HTTP for up to a year',
      ]),
      heading('config-h2', 'h2', 'A fuller example'),
      codeBlock(
        'config-code2',
        "export default {\n  site: { name: 'My site', url: 'https://example.com' },\n  database: { driver: 'postgres', url: process.env.DATABASE_URL },\n  storage: { driver: 'auto', path: './.cogenta/media' },\n  security: {\n    pageMaxAge: 300,\n    cors: { origins: ['https://app.example.com'] },\n  },\n}",
      ),
      heading('config-h3', 'h2', 'Config file versus environment variables'),
      paragraph(
        'config-p2',
        'Every secret — a database password, an LLM provider key, the signing key itself — is read from the environment, never written into cogenta.config.mjs. Everything else that describes the shape of the site (its name, its cache lifetime, which optional features are on) belongs in the config file, where it is reviewable in a diff like any other code change.',
      ),
    ],
  },
  {
    title: 'Deploying to production',
    slug: 'deploying-to-production',
    section: 'Guides',
    order: 1,
    body: [
      paragraph(
        'deploy-p1',
        'A production deploy is the same site, run with a real database and a signing key that never changes between restarts. There is no separate "build for production" artifact to keep in sync with the project — cogenta serve is the one code path that renders every page, in development and in production alike.',
      ),
      heading('deploy-h1', 'h2', 'Steps'),
      ...bulletList('deploy-list', [
        'Set COGENTA_AUTH_SIGNING_KEY to a stable, secret value — generate one with openssl rand -base64 32 and store it in your host’s secret manager, never in a committed file',
        'Point database.url at your production database',
        'Run cogenta migrate once, before the first request — an unapplied migration is a startup error, not a silent gap',
        'Start the server with cogenta serve',
        'Put a process manager or your platform’s own supervisor in front of it, so a crash restarts the process rather than taking the site down until someone notices',
      ]),
      codeBlock('deploy-code1', 'cogenta migrate\ncogenta serve --port 3000'),
      heading('deploy-h2', 'h2', 'Environment variables'),
      paragraph(
        'deploy-p2',
        'Every secret is read from the environment, never written to a config file that could end up in version control. At minimum, a production deploy needs COGENTA_AUTH_SIGNING_KEY and, for anything but SQLite, DATABASE_URL — an LLM provider key is optional and only needed if you plan to run an agent.',
      ),
      heading('deploy-h3', 'h2', 'Zero-downtime restarts'),
      paragraph(
        'deploy-p3',
        'cogenta serve refuses new connections and waits for in-flight requests to finish before exiting on SIGTERM, which is what lets a rolling restart behind a load balancer avoid dropping a request mid-flight. It never runs a schema migration on its own — cogenta migrate is always a separate, explicit step, so a deploy that skips it fails loudly instead of starting against a database it does not recognise.',
      ),
      heading('deploy-h4', 'h2', 'Health checks'),
      paragraph(
        'deploy-p4',
        'GET /api/health returns 200 once the database connection is live and the schema has loaded — point your platform’s liveness probe at it rather than at the homepage, which also depends on content actually being published.',
      ),
    ],
  },
  {
    title: 'Content model',
    slug: 'content-model',
    section: 'Guides',
    order: 2,
    body: [
      paragraph(
        'model-p1',
        'A collection is a TypeScript declaration: a name, a set of fields, and who may read, create, update, delete and publish it. Every REST route, every GraphQL type, every admin screen, and every permission check in Cogenta is generated from this one declaration — there is no second schema to keep in sync by hand.',
      ),
      codeBlock(
        'model-code1',
        "export const article = defineCollection({\n  name: 'article',\n  fields: {\n    title: f.text({ required: true }),\n    body: f.richText(),\n  },\n})",
      ),
      heading('model-h1', 'h2', 'Field kinds'),
      ...bulletList('model-list', [
        'text, richText, number, boolean, date — the ordinary scalar fields',
        'media — a reference into the media library, with alt text tracked alongside it',
        'relation — a typed link to another collection’s entry, with an explicit rule for what happens on delete (restrict, by default)',
        'taxonomy — a link to a classified term in a hierarchy your site owns, such as a category or a tag tree',
        'blocks — a page composed from the shared block vocabulary (hero, prose, feature grid, and so on) — this is what every landing page and this very doc page uses for its body',
      ]),
      heading('model-h2', 'h2', 'Permissions, per action'),
      paragraph(
        'model-p2',
        'A collection names, separately, who may read, create, update, delete and publish it — five independent gates, not one "can edit" flag. A press-kit collection might be public to read but restricted to admin to write; a draft-only internal note might be closed to everyone but editors in both directions.',
      ),
      codeBlock(
        'model-code2',
        "permissions: {\n  read: ['public'],\n  create: ['editor', 'admin'],\n  update: ['editor', 'admin'],\n  delete: ['admin'],\n}",
      ),
      heading('model-h3', 'h2', 'Versioning, drafts and trash'),
      paragraph(
        'model-p3',
        'Every write to a published entry keeps its previous version — the History tab in the admin can compare and restore any of them. Deleting an entry moves it to the trash rather than destroying it outright; it is recoverable until it is purged, which is a distinct, deliberate action.',
      ),
    ],
  },
  {
    title: 'Themes',
    slug: 'themes',
    section: 'Guides',
    order: 3,
    body: [
      paragraph(
        'themes-p1',
        'A theme is an installable package that renders every block in the shared vocabulary, plus its own header, footer and article layout. A theme never touches the database or a secret directly — it receives a RenderContext and a small, permission-scoped client, and nothing else. The block data it renders is always sanitised, structured content; a theme can shape it however it likes but cannot smuggle raw HTML into a block.',
      ),
      heading('themes-h1', 'h2', 'Built in'),
      ...bulletList('themes-list', [
        'canonical — the reference implementation every other theme is checked against',
        'blog, magazine, portfolio — editorial and creative sites',
        'docs — this site, built for a sidebar table of contents, code blocks, and deep nesting',
        'saas, association, restaurant, entreprise, store — the rest of the catalogue, one per common site type',
      ]),
      paragraph(
        'themes-p2',
        'Switch themes from the admin’s Appearance screen — the change applies to the next request, no restart required, because the active theme’s name is stored in the database and resolved on every request rather than imported once at boot.',
      ),
      heading('themes-h2', 'h2', 'Customising without writing a theme'),
      paragraph(
        'themes-p3',
        'Most day-to-day customisation is a colour palette (a "skin"), not a new theme: accent colour, surface colour, radii and a handful of other tokens, generated from a couple of brand colours and previewed live before you apply it. Writing an entirely new theme is a bigger commitment — a real npm package with its own tests — reserved for a genuinely different layout, not a different colour scheme.',
      ),
      heading('themes-h3', 'h2', 'Light, dark, and letting the visitor choose'),
      paragraph(
        'themes-p4',
        'Every built-in theme ships a complete dark palette, not an inverted one — dedicated colour and elevation decisions for low light, matching the light palette’s structure token for token. The small sun or moon control in the header (try it — it is in the corner of this very page) cycles between following the visitor’s own system setting, forcing light, and forcing dark, and remembers the choice across a visit without ever setting a cookie.',
      ),
    ],
  },
  {
    title: 'Plugins',
    slug: 'plugins',
    section: 'Guides',
    order: 4,
    body: [
      paragraph(
        'plugins-p1',
        'A plugin declares a manifest — the capabilities it needs, nothing implicit — and runs isolated from the rest of the site. A plugin that never asks for http.fetch cannot reach the network no matter what its code tries; a capability a manifest never names is absent, not merely refused at the last moment.',
      ),
      codeBlock(
        'plugins-code1',
        "export default definePlugin({\n  name: 'example-plugin',\n  capabilities: ['content.read', 'http.fetch'],\n})",
      ),
      heading('plugins-h1', 'h2', 'What a capability grants'),
      ...bulletList('plugins-list', [
        'content.read — read-only access to published content',
        'http.fetch — outbound HTTP, to a reviewed allow-list, never an open socket',
        'storage.read / storage.write — a private, per-plugin key-value store other plugins cannot see',
      ]),
      heading('plugins-h2', 'h2', 'Where a plugin actually runs'),
      paragraph(
        'plugins-p2',
        'Plugin code runs in an isolated worker thread inside a further-restricted execution context, not in the same process space as the rest of the site. A plugin that hangs, leaks memory, or is simply malicious cannot see the database, the file system, or another plugin’s data — only the SDK functions its granted capabilities actually construct for it.',
      ),
      heading('plugins-h3', 'h2', 'Installing and reviewing one'),
      paragraph(
        'plugins-p3',
        'Every plugin from the registry is signed; an unsigned or tampered package is refused before its code ever runs. The Plugins screen in the admin lists exactly what a plugin is asking for in plain language — "read your published content", not a capability identifier — and any admin can revisit that grant and revoke it later without uninstalling the plugin outright.',
      ),
    ],
  },
  {
    title: 'CLI reference',
    slug: 'cli-reference',
    section: 'Reference',
    order: 1,
    body: [
      paragraph('cli-p1', 'Every subcommand of the cogenta binary.'),
      heading('cli-h1', 'h2', 'Commands'),
      ...bulletList('cli-list', [
        'cogenta dev — starts the server with the schema editor enabled',
        'cogenta serve — starts the server in read-only-schema production mode',
        'cogenta migrate — applies pending database migrations',
        'cogenta doctor — checks the environment for common misconfiguration',
        'cogenta users create — creates the first admin account',
        'cogenta import wordpress — imports content from a WordPress WXR export',
        'cogenta generate types — writes TypeScript types generated from your schema',
        'cogenta skin list / validate / apply / generate — manage colour palettes from the command line',
        'cogenta channels — runs the Telegram/Slack/Discord bridge as its own process, separate from serve',
        'cogenta mcp — starts a Model Context Protocol server exposing this site’s content to an external agent',
      ]),
      codeBlock('cli-code1', 'cogenta doctor\ncogenta users create --email admin@example.com'),
      heading('cli-h2', 'h2', 'Global flags'),
      ...bulletList('cli-flags', [
        '--config <path> — use a config file other than cogenta.config.mjs',
        '--port <n> — override the port cogenta serve/dev listens on',
        '--json — machine-readable output, where a command supports it (cogenta doctor, for one)',
      ]),
      heading('cli-h3', 'h2', 'dev versus serve'),
      paragraph(
        'cli-p2',
        'cogenta dev is the only command that ever writes cogenta.schema.* — from the visual schema editor, or by applying an AI-proposed site plan. cogenta serve treats the schema as read-only, by design: a production site should never have its content model changed by an unattended process.',
      ),
    ],
  },
  {
    title: 'Configuration reference',
    slug: 'configuration-reference',
    section: 'Reference',
    order: 2,
    body: [
      paragraph('confref-p1', 'Every key cogenta.config.mjs accepts, grouped by section.'),
      heading('confref-h1', 'h2', 'site'),
      ...bulletList('confref-site', [
        'name — the site’s display name',
        'url — the canonical public URL, used for SEO tags',
      ]),
      heading('confref-h2', 'h2', 'database'),
      ...bulletList('confref-db', [
        'driver — sqlite, postgres, or mysql',
        'url — a connection string, for postgres/mysql',
        'poolSize — the maximum number of pooled connections (default 5)',
      ]),
      heading('confref-h3', 'h2', 'security'),
      ...bulletList('confref-security', [
        'pageMaxAge — the public cache lifetime, in seconds',
        'cors — disabled by default; an explicit allow-list to enable it',
        'csp — a verbatim Content-Security-Policy header value',
        'hstsMaxAge — zero by default, and never sent over plain HTTP; set only once every subdomain genuinely serves HTTPS',
      ]),
      heading('confref-h4', 'h2', 'storage, cache and queue'),
      paragraph(
        'confref-p2',
        'Each of these has a driver key defaulting to "auto": Cogenta picks the best available implementation (S3-compatible storage, Redis, a real queue) when one is configured, and falls back to a file- or database-backed implementation that needs no external service otherwise. A site never fails to start for lacking infrastructure it was never given.',
      ),
      heading('confref-h5', 'h2', 'embeddings and vector'),
      ...bulletList('confref-ai', [
        'embeddings.provider — "local" by default, a zero-dependency hash-based embedder that needs no API key',
        'vector.driver — "auto"; falls back to an in-memory or file-backed cosine index without pgvector',
      ]),
    ],
  },
  {
    title: 'HTTP API',
    slug: 'http-api',
    section: 'Reference',
    order: 3,
    body: [
      paragraph(
        'api-p1',
        'Every collection is exposed as REST under /api/content, permission-checked against the same rules the admin obeys — a viewer role gets exactly the same 403 from the API that it would get clicking the same action in the admin UI.',
      ),
      heading('api-h1', 'h2', 'Content endpoints'),
      ...bulletList('api-list', [
        'GET /api/content/:collection — list published entries',
        'GET /api/content/:collection/:id — read one entry',
        'POST /api/content/:collection — create an entry (requires a session)',
        'PATCH /api/content/:collection/:id — update an entry',
        'DELETE /api/content/:collection/:id — move an entry to the trash (recoverable)',
        'GET /api/search?q= — full-text search across public collections',
      ]),
      codeBlock('api-code1', 'curl https://example.com/api/content/doc_page?limit=10'),
      heading('api-h2', 'h2', 'Site-level endpoints'),
      ...bulletList('api-site', [
        'GET /sitemap.xml — generated from published, indexable entries',
        'GET /robots.txt — generated from the same rules the sitemap uses',
        '/graphql — a GraphQL endpoint generated from the same schema as the REST routes',
      ]),
      heading('api-h3', 'h2', 'Authentication'),
      paragraph(
        'api-p2',
        'A write to any endpoint above requires a session cookie or a bearer token belonging to a signed-in user; anonymous requests only ever see what the public role is granted to read. There is no separate "API key" that bypasses the permission model a human editor is held to.',
      ),
    ],
  },
]

export interface DocumentationDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home` — the six-block composition the brief fixes exactly, in order:
 * hero (title/subtitle/actions, a small decorative `coverArt` panel) →
 * featureGrid "Start here" (six cards, each linking a real seeded doc page)
 * → collectionList "All guides" on `doc_page` (the theme groups it by
 * section) → prose "Quick install" (with a real code block) → faq → cta
 * "Contribute on GitHub".
 *
 * A function of `media` (`SeedContext.media`), not a static const: the
 * hero's `media` field needs the id `seedDemoMedia` only knows at scaffold
 * time.
 */
export function buildDocumentationDemoPages(
  media: Readonly<Record<string, string>>,
): readonly DocumentationDemoPage[] {
  return [
    {
      title: 'Documentation',
      slug: 'home',
      blocks: [
        {
          _key: 'demo-home-hero',
          _type: 'hero',
          _version: BLOCK_VERSION,
          eyebrow: 'Documentation',
          title: 'Documentation',
          subtitle: 'Guides, reference and real examples, kept in sync with every release.',
          ...(media.hero === undefined ? {} : { media: media.hero }),
          actions: [
            { label: 'Get started', target: { href: '/docs/introduction' }, emphasis: 'primary' },
            { label: 'API reference', target: { href: '/docs/cli-reference' } },
          ],
        } as VocabularyBlock,
        {
          _key: 'demo-home-start',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: 'Start here',
          items: [
            {
              _key: 'start-1',
              icon: 'download',
              title: 'Install',
              text: 'One command, three supported databases.',
              link: { href: '/docs/installation' },
            },
            {
              _key: 'start-2',
              icon: 'settings',
              title: 'Configure',
              text: 'Every option, with its default.',
              link: { href: '/docs/configuration' },
            },
            {
              _key: 'start-3',
              icon: 'rocket',
              title: 'Deploy',
              text: 'From a first request to a production release.',
              link: { href: '/docs/deploying-to-production' },
            },
            {
              _key: 'start-4',
              icon: 'layers',
              title: 'Content model',
              text: 'Collections, fields and permissions.',
              link: { href: '/docs/content-model' },
            },
            {
              _key: 'start-5',
              icon: 'image',
              title: 'Themes',
              text: 'Ten built-in themes, switchable with no restart.',
              link: { href: '/docs/themes' },
            },
            {
              _key: 'start-6',
              icon: 'code',
              title: 'Plugins',
              text: 'Capability-scoped, isolated at runtime.',
              link: { href: '/docs/plugins' },
            },
          ],
        },
        {
          _key: 'demo-home-guides',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'All guides',
          collection: 'doc_page',
          sort: { field: 'createdAt', direction: 'asc' },
          limit: 100,
          layout: 'list',
        },
        proseBlock('demo-home-install', [
          heading('demo-install-h', 'h2', 'Quick install'),
          paragraph('demo-install-p', 'The whole of getting started, in one command:'),
          codeBlock('demo-install-code', 'npm create cogenta my-docs\ncd my-docs\nnpm run dev'),
        ]),
        {
          _key: 'demo-home-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'Common questions',
          items: [
            {
              _key: 'demo-home-faq-1',
              question: 'Which version do these docs describe?',
              answer: richTextParagraph(
                'demo-home-faq-1-a',
                'The one currently released. Older versions stay online at their own URLs rather than being rewritten in place.',
              ),
            },
            {
              _key: 'demo-home-faq-2',
              question: 'Can I edit these pages?',
              answer: richTextParagraph(
                'demo-home-faq-2-a',
                'Yes — every doc page below is a normal, editable entry, seeded once by the installer and owned by you from then on.',
              ),
            },
            {
              _key: 'demo-home-faq-3',
              question: 'Do the code examples actually run?',
              answer: richTextParagraph(
                'demo-home-faq-3-a',
                'They describe the real commands and files this project ships — they are not generated placeholder text.',
              ),
            },
            {
              _key: 'demo-home-faq-4',
              question: 'Something here is wrong. What do I do?',
              answer: richTextParagraph(
                'demo-home-faq-4-a',
                'Open a pull request against the docs source — see "Contribute on GitHub" below.',
              ),
            },
          ],
        },
        {
          _key: 'demo-home-cta',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Contribute on GitHub',
          text: 'Found a gap, a broken link, or an outdated example? Open a pull request.',
          actions: [
            {
              label: 'Open GitHub',
              target: { href: 'https://github.com/cogenta-cms/cogenta' },
              emphasis: 'primary',
            },
          ],
        },
      ],
    },
  ]
}

/**
 * `documentation`'s own starting skin (`starting-skins.js`), asserted
 * present with a real check — same pattern `store.ts`'s `storePalette()`
 * uses.
 */
function documentationPalette(): Palette {
  const skin = STARTING_SKINS.documentation
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.documentation is missing.',
      hint: 'The "documentation" entry must stay declared in starting-skins.ts for this blueprint to render its demo art.',
    })
  }
  return skin.color
}

/**
 * A small decorative panel for the hero (`coverArt`, not `heroArt`: the
 * brief asks for "a small coverArt used as decorative right-side panel",
 * not a full-bleed backdrop), plus two more for the "Content model" and
 * "Themes" doc pages (L26 D2/D3) — the two guides dense enough in prose
 * that the user's "some pages read as too bare" complaint applied to them
 * specifically. This blueprint has no bundled photography (a docs site is
 * diagram-led, not photo-led, and there is no Replicate key any more to
 * generate new photos) — every one of these three is the same zero-
 * dependency procedural generator, at a different seed so no two repeat.
 */
export const DOCUMENTATION_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: coverArt(documentationPalette(), 5),
    alt: 'Abstract geometric composition, decorative',
  },
  {
    name: 'docsContentModel',
    spec: coverArt(documentationPalette(), 8),
    alt: 'Abstract diagram-style illustration, decorative',
  },
  {
    name: 'docsThemes',
    spec: coverArt(documentationPalette(), 11),
    alt: 'Abstract diagram-style illustration, decorative',
  },
]

/**
 * The two doc pages illustrated with the extra `docsContentModel`/
 * `docsThemes` panels above, keyed by slug — a `mediaFigure` block appended
 * after the page's own prose, never in place of it. `f.blocks()` already
 * carries the shared vocabulary, so this needs no schema change: `doc_page`
 * keeps its five declared fields exactly as they were.
 */
const DOC_PAGE_ILLUSTRATIONS: Readonly<
  Record<string, { readonly media: string; readonly caption: string }>
> = {
  'content-model': {
    media: 'docsContentModel',
    caption: 'A collection: fields, permissions, and a version history, all declared in one place.',
  },
  themes: {
    media: 'docsThemes',
    caption: 'One content model, rendered by any of the ten built-in themes.',
  },
}

/** Header/footer navigation and the header call-to-action button (L25 D4). */
export const DOCUMENTATION_MENUS: BlueprintMenus = {
  header: [
    { label: 'Docs' },
    { label: 'Guides', url: '/docs/deploying-to-production' },
    { label: 'Reference', url: '/docs/cli-reference' },
    // No blog collection exists in this blueprint (contract B is frozen and
    // a blog needs its own content model, out of scope for a docs site) —
    // the release notes on GitHub are the honest stand-in a real docs site
    // links to when it has none of its own.
    { label: 'Blog', url: 'https://github.com/cogenta-cms/cogenta/releases', openInNewTab: true },
  ],
  footer: [
    { label: 'Docs' },
    {
      label: 'Community',
      url: 'https://github.com/cogenta-cms/cogenta/discussions',
      openInNewTab: true,
    },
    { label: 'GitHub', url: 'https://github.com/cogenta-cms/cogenta', openInNewTab: true },
  ],
  headerAction: {
    label: 'GitHub',
    url: 'https://github.com/cogenta-cms/cogenta',
    openInNewTab: true,
  },
}

export const DOCUMENTATION_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Documentation that stays honest about what is actually built.',
  'general.socialLinks': [
    { label: 'GitHub', url: 'https://github.com/cogenta-cms/cogenta' },
    { label: 'X', url: 'https://x.com/cogenta' },
    { label: 'Discord', url: 'https://discord.gg/cogenta' },
  ],
  'general.footerNote': 'A demo documentation site, scaffolded by create-cogenta.',
}

export const DOCUMENTATION_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'contentAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Flags terminology drift across doc pages, where consistent wording matters most.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Audits internal linking between doc pages so readers can navigate without the sidebar.',
  },
]

/**
 * Inserts the `documentation` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule). Every doc page's body starts
 * with the same sidebar `collectionList`, and every entry — doc pages and
 * the home page alike — is seeded **published**: this is project-authored
 * demo content, not model output (contrast L19, where generated content
 * stays a draft).
 */
async function seedDocumentationDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const docPageStore = createContentStore({ db, collection: docPage, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of DOCUMENTATION_DEMO_DOC_PAGES) {
    const illustration = DOC_PAGE_ILLUSTRATIONS[demo.slug]
    const mediaId = illustration === undefined ? undefined : media[illustration.media]
    const body: readonly VocabularyBlock[] = [
      sidebarBlock(`sidebar-${demo.slug}`),
      proseBlock(`content-${demo.slug}`, demo.body),
      // `mediaFigure.media` is required — with no matching media seeded
      // (should `seedDemoMedia` ever be skipped upstream), the block is
      // omitted rather than emitted invalid.
      ...(illustration === undefined || mediaId === undefined
        ? []
        : [
            {
              _key: `figure-${demo.slug}`,
              _type: 'mediaFigure',
              _version: BLOCK_VERSION,
              media: mediaId,
              caption: illustration.caption,
              align: 'wide',
            } as VocabularyBlock,
          ]),
    ]
    await docPageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug, section: demo.section, order: demo.order },
      blocks: { body: body.map(toBlockZoneEntry) },
    })
  }

  for (const demo of buildDocumentationDemoPages(media)) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const documentationContentPack: BlueprintContentPack = {
  collections: DOCUMENTATION_COLLECTIONS,
  recommendedAgents: DOCUMENTATION_RECOMMENDED_AGENTS,
  seedDemoContent: seedDocumentationDemoContent,
  defaultTheme: '@cogenta/theme-docs',
  menus: DOCUMENTATION_MENUS,
  siteSettings: DOCUMENTATION_SITE_SETTINGS,
  mediaSpecs: DOCUMENTATION_MEDIA_SPECS,
}
