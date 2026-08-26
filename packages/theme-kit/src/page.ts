import {
  type AnyBlockDefinition,
  type BlockRegistry,
  type BlockVariant,
  type CollectionListBlock,
  type UnknownPlacedBlock,
  type VocabularyBlock,
  vocabularyRegistry,
} from '@cogenta/blocks'
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
 * Stamps a placed block's `variant` (`blocks@2.0`, RFC 0002) onto the
 * element it rendered to, as one `data-variant-<axis>` attribute per axis
 * actually set. A theme's CSS then selects `[data-variant-background="muted"]`
 * and resolves it to its own token, exactly the indirection `theme.tokens.json`
 * already uses for colour — no second place a variant value lives.
 *
 * An axis left unset by the author emits no attribute at all, which is what
 * makes "unset" and "this theme's default" the same thing on the render
 * side: a theme that implements no variant at all needs zero code changes,
 * and one that implements only `background` can ignore the rest safely.
 *
 * Applied once, inside every theme's `renderBlock`, rather than by each of
 * the seventeen block renderers — the same shared-envelope reasoning that
 * put `variant` on `BlockIdentity` instead of on each block's own schema.
 */
export function withBlockVariant(
  element: HtmlElement | null,
  variant: BlockVariant | undefined,
): HtmlElement | null {
  if (element === null || variant === undefined) return element
  const attrs: Record<string, string> = {}
  if (variant.background !== undefined) attrs['data-variant-background'] = variant.background
  if (variant.spacing !== undefined) attrs['data-variant-spacing'] = variant.spacing
  if (variant.align !== undefined) attrs['data-variant-align'] = variant.align
  if (variant.width !== undefined) attrs['data-variant-width'] = variant.width
  if (Object.keys(attrs).length === 0) return element
  return { ...element, attrs: { ...element.attrs, ...attrs } }
}

/**
 * Resolves any placed block — one of the shared vocabulary, or a block a
 * theme ships of its own — to something a theme's `renderBlock` (an
 * exhaustive `switch` over `VocabularyBlock`, deliberately, so a thirteenth
 * shared type still fails to compile until every theme handles it) can
 * actually take.
 *
 * `BlockRegistry.resolveRenderable` already carries the anti-lock-in half of
 * contract B — a theme's private block must name a `fallback`, walked until
 * something the active theme actually implements is reached — but before
 * this function nothing on the render path ever called it: a stored block
 * whose exact type the active theme did not implement rendered as `null`, a
 * silently blank slot rather than the degraded-but-present block the
 * contract promises (fiche 43, sous-chantier C(ii)).
 *
 * `knownNames` is what the caller's own `renderBlock` switch actually
 * handles — `VOCABULARY_NAMES` for every one of the five in-house themes
 * today, since none of them ships a block of its own yet. A theme (or a
 * theme-shipping plugin) that does passes its own, wider list.
 *
 * Only ever widens what a caller can *pass in*, never what contract B's
 * closed vocabulary is: the fallback's own shape is what gets rendered, and
 * only when the stored data actually validates as an instance of it. A
 * private block earns real, undegraded rendering by an active theme that
 * implements it directly; this is the safety net for every other case, not a
 * data-mapping engine — data that does not fit the fallback's shape yields
 * `null` for that one block, never a thrown error that would take the whole
 * page down with it.
 */
export function resolveBlockForRender(
  block: VocabularyBlock | UnknownPlacedBlock,
  knownNames: readonly string[],
  registry: BlockRegistry = vocabularyRegistry,
): UnknownPlacedBlock | null {
  if (knownNames.includes(block._type)) {
    // A member of the closed `VocabularyBlock` union does not structurally
    // satisfy `UnknownPlacedBlock`'s index signature (each member is built
    // from a mapped type, which TypeScript never treats as implicitly
    // indexable) — the cast states what is already true at the value level:
    // every field of a placed block is `unknown` to a caller this generic.
    return block as unknown as UnknownPlacedBlock
  }

  let definition: AnyBlockDefinition | undefined
  try {
    definition = registry.resolveRenderable(block._type, knownNames)
  } catch {
    // Not registered at all, or its fallback chain loops back on itself —
    // nothing safe to guess. The block is dropped, not the page.
    return null
  }
  if (definition === undefined) return null

  const candidate = { ...block, _type: definition.name }
  const parsed = definition.validator.safeParse(candidate)
  if (!parsed.success) return null
  return parsed.data as UnknownPlacedBlock
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
