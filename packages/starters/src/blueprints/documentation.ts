import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createMenuStore,
  defineCollection,
  ensureMenuTables,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import { coverArt, type Palette } from '../demo-art/compositions.js'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import type { DocumentationCopy, FooterColumn } from './documentation-copy.js'
import { DOCUMENTATION_COPY_EN } from './documentation-copy-en.js'
import { DOCUMENTATION_COPY_FR } from './documentation-copy-fr.js'
import { fillNames, productNames, writer } from './documentation-writer.js'
import type { BlueprintMenus } from './menus.js'
import { STARTING_SKINS } from './starting-skins.js'
import type { BlueprintWidget } from './widgets.js'

export type { DocumentationCopy, FooterColumn } from './documentation-copy.js'
export { DEFAULT_PRODUCT_NAME, productName, productNames } from './documentation-writer.js'

/**
 * The `documentation` blueprint: the documentation site of a developer tool,
 * rewritten to studio level by L27 and written in French and in English by
 * L36 (`documentation-copy-fr.ts`, `documentation-copy-en.ts`).
 *
 * The product is a self-hosted webhook delivery server: an application sends
 * it events over HTTP, and it signs, sends, retries and records a request for
 * every endpoint subscribed to each event. It was chosen because it gives a
 * documentation site everything it is made of (a CLI, a configuration file,
 * an HTTP API, code in several languages, failure modes worth a
 * troubleshooting page) without pretending to be a hosted service that would
 * need a sign-up flow the site cannot offer. It runs on `localhost`, so every
 * example is one a reader could actually type.
 *
 * The product is named after the site (`SeedContext.siteName`, with a
 * trailing "Docs" or "Documentation" dropped), falling back to "Relay". Its
 * command, environment variables and header names are derived from that
 * name, so the quickstart, the CLI reference and the API reference always
 * agree with each other.
 *
 * Content model:
 *
 * - `doc_page`: one page of documentation at `/docs/:slug`, with its
 *   `section`, its `order` in the whole documentation, a one-sentence
 *   `summary` shown under its title, and a block zone whose first block is
 *   the `collectionList` on `doc_page` that `@cogenta/theme-docs` renders as
 *   the navigation (see the theme's `doc-page.ts`).
 * - `page`: the home page.
 *
 * Rich text carries four shapes the theme renders as documentation furniture
 * (code blocks with a file name, notes, reference tables, keys); see
 * `@cogenta/theme-docs`'s `rich-text.ts`. Every other theme renders the same
 * data as plain paragraphs and lists.
 */

/** The copy for a site's default locale: French for any `fr*` locale, English otherwise. */
export function documentationCopyFor(locale: string): DocumentationCopy {
  return locale.toLowerCase().startsWith('fr') ? DOCUMENTATION_COPY_FR : DOCUMENTATION_COPY_EN
}

export const docPage = defineCollection({
  name: 'doc_page',
  versioning: { drafts: true, history: true },
  labels: { singular: 'Doc page', plural: 'Doc pages' },
  routing: { pattern: '/docs/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    section: f.text({ required: true, max: 80 }),
    order: f.number({ required: true, integer: true, min: 0 }),
    summary: f.text({ max: 300, multiline: true }),
    body: f.blocks({ required: true }),
    ...SEO_FIELDS,
  },
  indexes: [['slug'], ['section']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const DOCUMENTATION_COLLECTIONS: readonly CollectionDefinition[] = [docPage, page]

validateCollectionSet(DOCUMENTATION_COLLECTIONS)

const BLOCK_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// The documentation
// ---------------------------------------------------------------------------

export interface DocumentationDemoDocPage {
  readonly title: string
  readonly slug: string
  /** The label of the section, in the site's language. */
  readonly section: string
  /** The page's place in the whole documentation, which is also its place in its section. */
  readonly order: number
  readonly summary: string
  readonly body: RichTextDocument
}

type PageBody = RichTextDocument[number] | readonly RichTextDocument[number][]

function flat(parts: readonly PageBody[]): RichTextDocument {
  return parts.flatMap((part) => (Array.isArray(part) ? part : [part])) as RichTextDocument
}

/** The documentation, in reading order, named after the site. `media.deliveryFlow` illustrates "Core concepts" when it was seeded. */
export function buildDocumentationDocPages(
  siteName?: string,
  media: Readonly<Record<string, string>> = {},
  locale = 'en',
): readonly DocumentationDemoDocPage[] {
  const copy = documentationCopyFor(locale)
  const names = productNames(siteName)
  return copy.pages.map((draft, index) => {
    const w = writer(draft.slug, names, { locale: copy.locale })
    return {
      title: copy.typography(draft.title),
      slug: draft.slug,
      section: copy.sections[draft.section],
      order: (index + 1) * 10,
      summary: copy.typography(fillNames(draft.summary, names)),
      body: flat(draft.body(w, media)),
    }
  })
}

export const DOCUMENTATION_DEMO_DOC_PAGES: readonly DocumentationDemoDocPage[] =
  buildDocumentationDocPages()

// ---------------------------------------------------------------------------
// The home page
// ---------------------------------------------------------------------------

export interface DocumentationDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home`: the statement and the search (the theme's hero draws the search
 * field), three places to start, the whole documentation by section, the
 * first lines of code a reader will write, common questions answered in the
 * open, and where to go when something does not work.
 */
export function buildDocumentationDemoPages(
  _media: Readonly<Record<string, string>>,
  siteName?: string,
  locale = 'en',
): readonly DocumentationDemoPage[] {
  const copy = documentationCopyFor(locale)
  const names = productNames(siteName)
  const w = writer('home', names, { locale: copy.locale })
  return [
    {
      title: copy.typography(copy.home.title(names.name)),
      slug: copy.home.slug,
      blocks: copy.home.blocks(names, w),
    },
  ]
}

// ---------------------------------------------------------------------------
// Pictures, navigation, settings
// ---------------------------------------------------------------------------

function documentationPalette(): Palette {
  const skin = STARTING_SKINS.documentation
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.documentation is missing.',
      hint: 'The "documentation" entry must stay declared in starting-skins.ts for this blueprint to seed its media.',
    })
  }
  return skin.color
}

/**
 * One picture: the delivery-flow diagram on "Core concepts", drawn once per
 * language with IBM Plex (OFL) and committed as a PNG
 * (`scripts/documentation-assets/`). Documentation needs no photographs, and
 * a decorative picture on the home page would only push the search field
 * down. The diagram carries no product name, so it stays true whatever the
 * site is called. `spec` is only the fallback `seedDemoMedia` requires should
 * the file ever be missing.
 */
export function documentationMediaSpecs(copy: DocumentationCopy): readonly DemoMediaSpec[] {
  return [
    {
      name: 'deliveryFlow',
      spec: coverArt(documentationPalette(), 5),
      photo: copy.diagram.file,
      alt: copy.typography(copy.diagram.alt),
    },
  ]
}

function documentationMenus(copy: DocumentationCopy): BlueprintMenus {
  return {
    header: copy.menus.header,
    // Seeded with the content instead (`seedFooterMenu`): a footer in columns
    // needs an unlinked heading per column, which `BlueprintMenus` cannot say.
    footer: [],
  }
}

/**
 * The widgets a documentation site really carries, placed by `@cogenta/theme-docs`
 * in the page rail: under "On this page", level with the end of the page.
 *
 * Nothing that repeats what the theme already draws on a doc page: no table
 * of contents (the theme builds "On this page" from the same headings), no
 * related or recent pages (the sidebar and previous/next are the reading
 * order, and a list sorted by creation date would contradict it), no search
 * field (the header holds one on every page). What is left is what a reader
 * who reached the end of a page needs: where to get help, and the upgrade
 * note of the current release, except on the release notes themselves.
 * Beside search results, a short list of the pages most readers come for,
 * useful above all when a search found nothing.
 */
function documentationWidgets(copy: DocumentationCopy): readonly BlueprintWidget[] {
  return copy.widgets(copy.pages.map((draft) => draft.slug))
}

export const DOCUMENTATION_MENUS: BlueprintMenus = documentationMenus(DOCUMENTATION_COPY_EN)

export const DOCUMENTATION_FOOTER: readonly FooterColumn[] = DOCUMENTATION_COPY_EN.footer

export const DOCUMENTATION_SITE_SETTINGS: Readonly<Record<string, unknown>> =
  DOCUMENTATION_COPY_EN.settings

export const DOCUMENTATION_WIDGETS: readonly BlueprintWidget[] =
  documentationWidgets(DOCUMENTATION_COPY_EN)

export const DOCUMENTATION_MEDIA_SPECS: readonly DemoMediaSpec[] =
  documentationMediaSpecs(DOCUMENTATION_COPY_EN)

export const DOCUMENTATION_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'contentAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Flags terminology that drifts from one doc page to another, where consistent wording matters most.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits internal links between doc pages, so readers can move on without the sidebar.',
  },
]

/** The documentation's own first block on every page: the index the theme draws as the navigation. */
function sidebarBlock(key: string): VocabularyBlock {
  return {
    _key: key,
    _type: 'collectionList',
    _version: BLOCK_VERSION,
    collection: 'doc_page',
    sort: { field: 'createdAt', direction: 'asc' },
    limit: 100,
    layout: 'list',
  }
}

async function seedFooterMenu(
  db: DatabaseHandle,
  locale: string,
  columns: readonly FooterColumn[],
): Promise<void> {
  await ensureMenuTables(db)
  const store = createMenuStore({ db })
  if ((await store.byLocation('footer', locale)) !== null) return
  const menu = await store.create({ name: 'footer', locale, label: 'footer', location: 'footer' })
  for (const column of columns) {
    const heading = await store.createItem(menu.id, {
      label: column.heading,
      kind: 'submenu-placeholder',
    })
    for (const link of column.links) {
      await store.createItem(menu.id, {
        label: link.label,
        kind: 'url',
        url: link.url ?? '/',
        parent: heading.id,
      })
    }
  }
}

/**
 * Inserts the documentation through the real `ContentStore` and `MenuStore`,
 * never mocked (house rule). Pages are created in reading order and carry
 * their `order`, so the navigation reads the same whatever order the database
 * returns them in. Everything is published: a theme lists only published
 * entries.
 */
function seedDocumentationDemoContent(copy: DocumentationCopy) {
  return async (ctx: SeedContext): Promise<void> => {
    const { db, defaultLocale, adminId, media, siteName } = ctx
    const docPageStore = createContentStore({ db, collection: docPage, defaultLocale })
    const pageStore = createContentStore({ db, collection: page, defaultLocale })

    for (const demo of buildDocumentationDocPages(siteName, media, copy.locale)) {
      const body: readonly VocabularyBlock[] = [
        sidebarBlock(`sidebar-${demo.slug}`),
        { _key: `content-${demo.slug}`, _type: 'prose', _version: BLOCK_VERSION, body: demo.body },
      ]
      await docPageStore.create({
        status: 'published',
        createdBy: adminId,
        values: {
          title: demo.title,
          slug: demo.slug,
          section: demo.section,
          order: demo.order,
          summary: demo.summary,
        },
        blocks: { body: body.map(toBlockZoneEntry) },
      })
    }

    for (const demo of buildDocumentationDemoPages(media, siteName, copy.locale)) {
      await pageStore.create({
        status: 'published',
        createdBy: adminId,
        values: { title: demo.title, slug: demo.slug },
        blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
      })
    }

    await seedFooterMenu(db, defaultLocale, copy.footer)
  }
}

/** The whole blueprint, in one language. */
export function createDocumentationContentPack(locale: string): BlueprintContentPack {
  const copy = documentationCopyFor(locale)
  return {
    collections: DOCUMENTATION_COLLECTIONS,
    recommendedAgents: DOCUMENTATION_RECOMMENDED_AGENTS,
    seedDemoContent: seedDocumentationDemoContent(copy),
    defaultTheme: '@cogenta/theme-docs',
    menus: documentationMenus(copy),
    widgets: documentationWidgets(copy),
    siteSettings: copy.settings,
    mediaSpecs: documentationMediaSpecs(copy),
  }
}

/** The English pack, which `BLUEPRINT_CONTENT_PACKS` lists; `contentPackFor` picks by locale. */
export const documentationContentPack: BlueprintContentPack = createDocumentationContentPack('en')
