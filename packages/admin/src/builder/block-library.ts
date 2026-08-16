import type { BlockDefinition } from '../blocks/vocabulary.js'
import { BLOCK_VOCABULARY } from '../blocks/vocabulary.js'

/**
 * The insertion panel's view of contract B's twelve blocks (L16 task 4).
 *
 * The categories are **presentation in this admin only**. Contract B declares
 * no category and is frozen, so inventing one there to make a panel easier to
 * scan would be exactly the silent contract change the project's rules forbid.
 * This table is the admin's own, in the same spirit as `vocabulary.ts` being
 * the admin's own hand-kept copy of the block list.
 *
 * Every block of the vocabulary appears in exactly one category — asserted by
 * a test, so a thirteenth block cannot quietly become unreachable from the
 * panel.
 */

export const BLOCK_CATEGORIES = ['highlight', 'text', 'media', 'listing'] as const

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number]

const CATEGORY_BY_BLOCK: Readonly<Record<string, BlockCategory>> = {
  hero: 'highlight',
  cta: 'highlight',
  prose: 'text',
  quote: 'text',
  faq: 'text',
  mediaFigure: 'media',
  gallery: 'media',
  logos: 'media',
  embed: 'media',
  featureGrid: 'listing',
  stats: 'listing',
  collectionList: 'listing',
}

export interface LibraryEntry {
  readonly definition: BlockDefinition
  readonly category: BlockCategory
}

export const BLOCK_LIBRARY: readonly LibraryEntry[] = BLOCK_VOCABULARY.map((definition) => ({
  definition,
  // A block with no category entry is not hidden from the panel — it would be
  // unusable rather than uncategorised. It lands in `listing`, and the test
  // that every block is categorised is what actually catches the omission.
  category: CATEGORY_BY_BLOCK[definition.name] ?? 'listing',
}))

/** Diacritic- and case-insensitive, so "media" finds "Média". */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase()
}

/**
 * Filters the library by a free-text query and an optional category.
 *
 * The query is matched against the human label *and* the contract-B type name,
 * because both are things a person types: an editor reaches for "citation",
 * someone who has read the schema reaches for "quote".
 */
export function searchLibrary(
  query: string,
  category: BlockCategory | null = null,
  library: readonly LibraryEntry[] = BLOCK_LIBRARY,
): readonly LibraryEntry[] {
  const needle = fold(query.trim())
  return library.filter((entry) => {
    if (category !== null && entry.category !== category) return false
    if (needle === '') return true
    return (
      fold(entry.definition.label).includes(needle) || fold(entry.definition.name).includes(needle)
    )
  })
}
