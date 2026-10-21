import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  COGENTA_VERSION,
  type DocTree,
  getDocPage,
  listDocPages,
} from '../documentation/docs-content.js'
import { DocsViewer } from '../documentation/docs-viewer.js'
import { usePageTitle } from '../shell/page-title.js'
import '../styles/documentation.css'
import { ChevronDownIcon } from '../ui/icons.js'
import { Card, CardBody, Notice } from '../ui/index.js'

/**
 * L22 task 7's in-admin half of the documentation, browsing the exact same
 * `docs-site/content/**` Markdown files `docs-site/build/generate.mjs`
 * publishes as a static site — bundled at build time by
 * `../documentation/docs-content.ts`, rendered by the exact same
 * `renderMarkdownToHtml` (`@cogenta/render`). Nothing here re-derives or
 * re-authors a single sentence of content; this file is page chrome only.
 *
 * Extends `documentation.tsx` (fiche 21's per-section quickstart panel)
 * rather than replacing it — that screen stays the fast "what does this
 * section do" overview; this one is the full functional/technical
 * documentation tree, reached from the button `documentation.tsx` now shows.
 *
 * `dangerouslySetInnerHTML` here is safe because the source is never
 * user-controlled: it is exactly the Markdown this repository's own authors
 * commit under `docs-site/content/` and `docs/guide-plugin.md`, run through a
 * renderer that escapes every text node and only ever emits the fixed set of
 * tags its own grammar can produce (see `packages/render/src/docs/markdown.ts`'s
 * own safety tests) — the same trust boundary `theme-canonical`'s
 * `Fragment set:html={serialize(...)}` blocks rely on for the same reason.
 *
 * A cross-page link inside the rendered content is a plain `<a href>` (raw
 * HTML, not a React Router `<Link>`) — clicking one does a full browser
 * navigation rather than a client-side route change. `cogenta serve` falls
 * back to `index.html` for any unmatched `/admin/*` path, so the navigation
 * still lands on the right screen; it costs an extra round trip. A known,
 * accepted simplification, not an oversight.
 */

const TREES: readonly DocTree[] = ['functional', 'technical']

export function DocumentationDocsRoute(): JSX.Element {
  const { t } = useTranslation()
  const params = useParams<{ tree?: string; slug?: string }>()
  const tree: DocTree = params.tree === 'technical' ? 'technical' : 'functional'
  const slug = params.slug ?? 'index'

  const page = getDocPage(tree, slug)
  // On a phone the list of pages folds behind a button naming the current
  // page, so the content is what opens first; on a wide window it is a
  // permanent sidebar.
  const [pagesOpen, setPagesOpen] = useState(false)
  // Every page of the tree used to share one tab name; each now carries its own.
  usePageTitle(page === undefined ? null : `${page.title} — ${t('nav.documentation')}`)

  return (
    <section aria-labelledby="documentation-docs-heading" className="min-w-0 flex flex-col gap-6">
      <div>
        {/* The page's own `# Title` (below) is the screen's one level-one
            heading: this is the section's name, not a second h1. */}
        <p
          id="documentation-docs-heading"
          className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t('documentation.docs.heading')}
        </p>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{t('documentation.docs.intro')}</p>
      </div>

      <div
        role="tablist"
        aria-label={t('documentation.docs.treesLabel')}
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {TREES.map((id) => (
          <Link
            key={id}
            role="tab"
            aria-selected={tree === id}
            to={`/documentation/docs/${id}/index`}
            className={
              tree === id
                ? 'border-b-2 border-primary px-3 py-2 text-sm font-semibold text-foreground'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground'
            }
          >
            {t(`documentation.docs.tree.${id}`)}
          </Link>
        ))}
      </div>

      {tree === 'technical' && (
        <Notice tone="info" live="off">
          <p>{t('documentation.docs.technicalInEnglish')}</p>
        </Notice>
      )}

      <div className="doc-browser-layout">
        <div className="doc-pages-nav">
          <button
            type="button"
            aria-expanded={pagesOpen}
            aria-controls="doc-pages-list"
            onClick={() => setPagesOpen((current) => !current)}
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm font-medium lg:hidden"
          >
            <span className="min-w-0 truncate">
              {page?.title ?? t('documentation.docs.pagesToggle')}
            </span>
            <ChevronDownIcon className={`size-4 shrink-0 ${pagesOpen ? 'rotate-180' : ''}`} />
          </button>
          <nav
            id="doc-pages-list"
            aria-label={t('documentation.docs.sidebarLabel')}
            className={`${pagesOpen ? 'block' : 'hidden'} mt-2 lg:mt-0 lg:block`}
          >
            <ul className="m-0 flex flex-col gap-1 pl-0 text-sm">
              {listDocPages(tree).map((item) => (
                <li key={item.slug} className="list-none">
                  <Link
                    to={`/documentation/docs/${tree}/${item.slug}`}
                    onClick={() => setPagesOpen(false)}
                    aria-current={item.slug === slug ? 'page' : undefined}
                    className={
                      item.slug === slug ? 'font-semibold text-foreground' : 'text-muted-foreground'
                    }
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="min-w-0 flex-1">
          {page === undefined ? (
            <Notice tone="warning" title={t('documentation.docs.notFoundTitle')}>
              {t('documentation.docs.notFoundBody')}
            </Notice>
          ) : (
            // No separate `<CardTitle>` here on purpose: every page under
            // `docs-site/content/**` opens with a `# Title` matching its own
            // frontmatter `title` (checked by `docs-content.test.ts`) — a
            // second heading repeating the same text would both look
            // redundant and produce two level-one headings, which is exactly
            // what `expectNoSeriousA11yViolations` below is written to catch.
            <Card>
              <CardBody>
                {/* See the file header comment for why this is safe: the source is this repository's own committed documentation, never user input. */}
                <DocsViewer html={page.html} title={page.title} />
              </CardBody>
            </Card>
          )}

          <p className="m-0 mt-4 text-xs text-muted-foreground">
            {t('documentation.docs.versionNote', { version: COGENTA_VERSION })}
          </p>
        </div>
      </div>
    </section>
  )
}
