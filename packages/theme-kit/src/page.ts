import type { CollectionListBlock, VocabularyBlock } from '@cogenta/blocks'
import type { ContentEntry, QueryRequest } from './contract.js'
import type { HtmlElement } from './html.js'

export interface PageContent {
  /** The entry's title. Rendered as the `h1` unless a hero already carries one. */
  readonly title: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * Entries already fetched for the `collectionList` blocks on the page, by the
 * block's `_key`. Fetching happens before any markup is built — a renderer
 * that could await would make the number of round trips depend on the
 * markup, which no theme can be trusted to keep constant across edits.
 */
export type FetchedEntries = Readonly<Record<string, readonly ContentEntry[]>>

/**
 * A page has exactly one `h1`.
 *
 * A `hero` declares `headingLevel: 'h1'` and renders the title itself, so a
 * theme's page layout must not render a second one; without a hero, nothing
 * else on the page would — `prose` starts at `h2` — and the page would have
 * no `h1` at all.
 */
export function pageHasOwnHeading(blocks: readonly VocabularyBlock[]): boolean {
  return blocks.some((block) => block._type === 'hero')
}

/**
 * Stamps the block's own `_key` onto the element it rendered to.
 *
 * The key is contract B's identity for a placed block — minted once, surviving
 * reorder, translation and version restore — so it is the one honest way for a
 * *reader* of the finished HTML to say "this piece of the page came from that
 * block". The visual page builder (L16) is such a reader: it shows the real
 * server-rendered page in an iframe and needs to map a clicked element back to
 * the block that produced it. Shared across every theme so that mapping works
 * identically regardless of which theme a site has installed.
 *
 * Emitted on every render, never only in a builder mode — a preview that is
 * assembled differently from the published page is exactly the divergence the
 * builder exists to rule out.
 */
export function withBlockKey(element: HtmlElement | null, key: string): HtmlElement | null {
  if (element === null) return null
  return { ...element, attrs: { ...element.attrs, 'data-block-key': key } }
}

/**
 * The `QueryRequest` a `collectionList` block's own fields describe — pure
 * data derived from contract B, never an editorial choice a theme makes, so
 * every theme resolves it identically rather than re-deriving it per layout.
 */
export function buildCollectionListQuery(block: CollectionListBlock): QueryRequest {
  return {
    collection: block.collection,
    ...(block.filter === undefined ? {} : { filter: block.filter }),
    ...(block.sort === undefined ? {} : { sort: block.sort }),
    // Capped by contract B at 100; an absent limit still must not mean "all".
    limit: block.limit ?? 10,
  }
}
