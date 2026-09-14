import type { CollectionListBlock, VocabularyBlock } from '@cogenta/blocks'
import type { ContentEntry, RenderContext } from '@cogenta/theme-kit'

/**
 * The documentation's own order, shared by the sidebar, the home page index
 * and previous/next.
 *
 * A doc page carries two plain fields: `section` (the group it belongs to)
 * and `order` (its place in that group). Neither is a sort field contract B
 * allows a `collectionList` to ask for (`id`/`createdAt`/`updatedAt` only),
 * so the list is fetched by creation date and ordered here: pages within a
 * section by `order`, then by the order they were fetched in; sections by the
 * smallest `order` they hold, then by the order they first appear. Two pages
 * created in the same millisecond can come back in either order, so the
 * documentation never depends on creation time alone.
 */

export const DOC_PAGE_COLLECTION = 'doc_page'

export interface DocGroup {
  readonly section: string
  readonly entries: readonly ContentEntry[]
}

export function isDocIndexBlock(block: VocabularyBlock): block is CollectionListBlock {
  return block._type === 'collectionList' && block.collection === DOC_PAGE_COLLECTION
}

export function groupDocPages(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
): readonly DocGroup[] {
  const groups = new Map<string, { entry: ContentEntry; position: number }[]>()
  entries.forEach((entry, position) => {
    const section =
      typeof entry.section === 'string' && entry.section.trim() !== ''
        ? entry.section.trim()
        : ctx.t('entry.untitled')
    const list = groups.get(section) ?? []
    list.push({ entry, position })
    groups.set(section, list)
  })
  const orderOf = (entry: ContentEntry): number =>
    typeof entry.order === 'number' ? entry.order : Number.POSITIVE_INFINITY
  return [...groups.entries()]
    .map(([section, list], appearance) => ({
      section,
      appearance,
      first: Math.min(...list.map((item) => orderOf(item.entry))),
      entries: [...list]
        .sort((a, b) => {
          const orderA = orderOf(a.entry)
          const orderB = orderOf(b.entry)
          return orderA === orderB ? a.position - b.position : orderA - orderB
        })
        .map((item) => item.entry),
    }))
    .sort((a, b) => (a.first === b.first ? a.appearance - b.appearance : a.first - b.first))
    .map(({ section, entries }) => ({ section, entries }))
}

/** The reading order of the whole documentation: every group, in turn. */
export function readingOrder(groups: readonly DocGroup[]): readonly ContentEntry[] {
  return groups.flatMap((group) => group.entries)
}
