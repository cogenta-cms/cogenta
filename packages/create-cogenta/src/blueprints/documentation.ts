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
        'Cogenta is an agentic, open-source CMS: a runtime for content, a runtime for agents, and the wiring between them, in one project.',
      ),
      heading('intro-h1', 'h2', "What's in the box"),
      ...bulletList('intro-list', [
        'A schema-driven content model — collections, fields, permissions, versioning.',
        'A theme layer with zero client JavaScript by default.',
        'A multi-agent runtime that can read, propose and — with your consent — apply changes to the site.',
      ]),
      paragraph(
        'intro-p2',
        'This site is itself a demo, scaffolded by create-cogenta from the "documentation" blueprint. Every page below is real, published content in a real database — edit it like any other entry.',
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
      heading('install-h1', 'h2', 'Requirements'),
      ...bulletList('install-req', [
        'Node.js — the current LTS or newer',
        'A database — SQLite (default, zero setup), PostgreSQL, or MySQL/MariaDB',
        'No other service is required to start',
      ]),
      heading('install-h2', 'h2', 'What gets created'),
      paragraph(
        'install-p2',
        'The installer writes a schema file, a starting skin, and — if you chose a template — demo content you can delete at any time.',
      ),
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
        'A site is configured by cogenta.config.mjs at the project root, loaded once at startup.',
      ),
      codeBlock(
        'config-code1',
        "export default {\n  site: { name: 'My site', url: 'https://example.com' },\n  database: { driver: 'sqlite' },\n}",
      ),
      heading('config-h1', 'h2', 'Commonly changed options'),
      ...bulletList('config-list', [
        'site.name and site.url — used across SEO tags and the sitemap',
        'database.driver — sqlite, postgres, or mysql',
        'security.pageMaxAge — the public cache lifetime for a rendered page',
      ]),
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
        'A production deploy is the same site, run with a real database and a signing key that never changes between restarts.',
      ),
      heading('deploy-h1', 'h2', 'Steps'),
      ...bulletList('deploy-list', [
        'Set COGENTA_AUTH_SIGNING_KEY to a stable, secret value',
        'Point database.url at your production database',
        'Run cogenta migrate once, before the first request',
        'Start the server with cogenta serve',
      ]),
      codeBlock('deploy-code1', 'cogenta migrate\ncogenta serve --port 3000'),
      heading('deploy-h2', 'h2', 'Environment variables'),
      paragraph(
        'deploy-p2',
        'Every secret is read from the environment, never written to a config file that could end up in version control.',
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
        'A collection is a TypeScript declaration: a name, a set of fields, and who may read, create, update, delete and publish it.',
      ),
      codeBlock(
        'model-code1',
        "export const article = defineCollection({\n  name: 'article',\n  fields: {\n    title: f.text({ required: true }),\n    body: f.richText(),\n  },\n})",
      ),
      heading('model-h1', 'h2', 'Field kinds'),
      ...bulletList('model-list', [
        'text, richText, number, boolean, date',
        'media — a reference into the media library',
        'relation and taxonomy — links to other entries or classified terms',
        'blocks — a page composed from the shared block vocabulary',
      ]),
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
        'A theme is an installable package that renders every block in the shared vocabulary, plus its own header, footer and article layout.',
      ),
      heading('themes-h1', 'h2', 'Built in'),
      ...bulletList('themes-list', [
        'canonical — the reference implementation',
        'blog, magazine, portfolio — editorial and creative sites',
        'docs — this site',
        'saas, association, restaurant, entreprise, store — the rest of the catalogue',
      ]),
      paragraph(
        'themes-p2',
        'Switch themes from the admin’s Appearance screen — the change applies to the next request, no restart required.',
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
        'A plugin declares a manifest — the capabilities it needs, nothing implicit — and runs isolated from the rest of the site.',
      ),
      codeBlock(
        'plugins-code1',
        "export default definePlugin({\n  name: 'example-plugin',\n  capabilities: ['content.read', 'http.fetch'],\n})",
      ),
      heading('plugins-h1', 'h2', 'What a capability grants'),
      ...bulletList('plugins-list', [
        'content.read — read-only access to published content',
        'http.fetch — outbound HTTP, to a reviewed allow-list',
        'storage.read / storage.write — a private, per-plugin key-value store',
      ]),
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
      ]),
      codeBlock('cli-code1', 'cogenta doctor\ncogenta users create --email admin@example.com'),
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
      ]),
      heading('confref-h3', 'h2', 'security'),
      ...bulletList('confref-security', [
        'pageMaxAge — the public cache lifetime, in seconds',
        'cors — disabled by default; an explicit allow-list to enable it',
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
        'Every collection is exposed as REST under /api/content, permission-checked against the same rules the admin obeys.',
      ),
      heading('api-h1', 'h2', 'Endpoints'),
      ...bulletList('api-list', [
        'GET /api/content/:collection — list published entries',
        'GET /api/content/:collection/:id — read one entry',
        'POST /api/content/:collection — create an entry (requires a session)',
        'GET /api/search?q= — full-text search across public collections',
      ]),
      codeBlock('api-code1', 'curl https://example.com/api/content/doc_page?limit=10'),
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
              text: 'Nine built-in themes, switchable with no restart.',
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

/** A single, small decorative panel for the hero — `coverArt`, not `heroArt`: the brief asks for "a small coverArt used as decorative right-side panel", not a full-bleed backdrop. */
export const DOCUMENTATION_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: coverArt(documentationPalette(), 5),
    alt: 'Abstract geometric composition, decorative',
  },
]

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
    const body: readonly VocabularyBlock[] = [
      sidebarBlock(`sidebar-${demo.slug}`),
      proseBlock(`content-${demo.slug}`, demo.body),
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
