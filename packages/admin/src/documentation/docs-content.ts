import { adaptDocHtmlForAdmin, type DocTree, renderMarkdownDocument } from '@cogenta/render'

export type { DocTree }

export interface DocPageSummary {
  readonly tree: DocTree
  readonly slug: string
  readonly title: string
  readonly order: number
}

export interface DocPage extends DocPageSummary {
  readonly html: string
}

/**
 * `@cogenta/core`'s `package.json` — the project's one source of truth for
 * the running Cogenta version (see `packages/cli`'s own `admin-assets.ts`
 * for the same "read it from core's `package.json`, never hand-maintain a
 * second copy" rule) — bundled the same way as the Markdown content below
 * rather than as a plain static `import`: a static import of a file outside
 * `tsconfig.json`'s `rootDir` (`packages/admin/`) fails typechecking, while
 * `import.meta.glob` is a Vite-resolved runtime call tsc never walks into.
 * The value ends up as a real build-time constant either way: a site running
 * an older Cogenta version has an older admin bundle, baked with that
 * version's number, showing that version's documentation.
 */
const CORE_PACKAGE_MODULES = import.meta.glob('../../../core/package.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Readonly<Record<string, string>>

function readCogentaVersion(): string {
  const raw = Object.values(CORE_PACKAGE_MODULES)[0]
  if (raw === undefined) return '0.0.0'
  const parsed = JSON.parse(raw) as { readonly version?: string }
  return parsed.version ?? '0.0.0'
}

export const COGENTA_VERSION: string = readCogentaVersion()

/**
 * Every `docs-site/content/{functional,technical}/*.md` file, bundled as raw
 * text at build time — the exact same files `docs-site/build/generate.mjs`
 * reads to produce the statically published site. `eager: true` because this
 * is a handful of small text files, not a reason to add a loading state to
 * every documentation page.
 */
const CONTENT_MODULES = import.meta.glob(
  '../../../../docs-site/content/{functional,technical}/*.md',
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Readonly<Record<string, string>>

/**
 * `docs/guide-plugin.md` — the real, pre-existing plugin author guide,
 * included by reference to its one source file rather than copied into
 * `docs-site/content/` (the same choice `generate.mjs` makes for the
 * statically published site).
 */
const PLUGIN_GUIDE_MODULES = import.meta.glob('../../../../docs/guide-plugin.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Readonly<Record<string, string>>

const DOC_PATH_PATTERN = /\/content\/(functional|technical)\/([\w-]+)\.md$/

/**
 * `cogenta serve` mounts this SPA at `/admin` (`vite.config.ts`'s
 * `base: command === 'build' ? '/admin/' : '/'`, the same value
 * `documentation.tsx`'s own `BRANDING_BASE` and `app.tsx`'s
 * `ROUTER_BASENAME` already read) — a rewritten cross-doc link needs the
 * same prefix, or it 404s under the admin's own local dev server.
 */
const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '')

function buildDocs(): Readonly<Record<DocTree, readonly DocPage[]>> {
  const functional: DocPage[] = []
  const technical: DocPage[] = []

  for (const [path, source] of Object.entries(CONTENT_MODULES)) {
    const match = DOC_PATH_PATTERN.exec(path)
    if (match === null) continue
    const tree = match[1] as DocTree
    const slug = match[2] as string
    const doc = renderMarkdownDocument(source)
    const page: DocPage = {
      tree,
      slug,
      title: doc.meta.title ?? slug,
      order: doc.meta.order === undefined ? 999 : Number(doc.meta.order),
      html: adaptDocHtmlForAdmin(doc.html, tree, BASE_PATH),
    }
    ;(tree === 'functional' ? functional : technical).push(page)
  }

  const pluginGuideSource = Object.values(PLUGIN_GUIDE_MODULES)[0]
  if (pluginGuideSource !== undefined) {
    const doc = renderMarkdownDocument(pluginGuideSource)
    technical.push({
      tree: 'technical',
      slug: 'creating-a-plugin',
      title: 'Creating a plugin',
      order: 4.5, // between "creating-a-theme" (4) and "api-reference" (5) — mirrors generate.mjs
      html: adaptDocHtmlForAdmin(doc.html, 'technical', BASE_PATH),
    })
  }

  functional.sort((a, b) => a.order - b.order)
  technical.sort((a, b) => a.order - b.order)
  return { functional, technical }
}

export const DOCS: Readonly<Record<DocTree, readonly DocPage[]>> = buildDocs()

export function getDocPage(tree: DocTree, slug: string): DocPage | undefined {
  return DOCS[tree].find((page) => page.slug === slug)
}

export function listDocPages(tree: DocTree): readonly DocPageSummary[] {
  return DOCS[tree]
}
