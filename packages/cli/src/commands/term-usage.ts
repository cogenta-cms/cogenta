import type { CollectionDefinition, ContentStore, TaxonomyDefinition } from '@cogenta/schema'

/**
 * How many entries carry a term on their *working* face, the trash included.
 *
 * `countTermReferences` (`@cogenta/schema`) reads the live columns and the
 * join tables. An edit of a published entry is an overlay written to the
 * versions table only, so a term that appears only in such a draft counts 0
 * there — and deleting it would leave the draft pointing at a term that is
 * gone, failing its next publish. The undo of `taxonomy.create_term` adds
 * this scan, the way the undo of `media.import_url` scans both faces.
 *
 * A scan that could not cover everything answers "in use" (`Infinity`):
 * refusing an undo costs a click, deleting a used term costs data.
 */
export async function countWorkingTermReferences(options: {
  readonly collections: readonly CollectionDefinition[]
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  readonly taxonomy: TaxonomyDefinition
  readonly termId: string
  readonly maxEntries?: number
}): Promise<number> {
  const maxEntries = options.maxEntries ?? 10_000
  let scanned = 0
  let count = 0
  for (const collection of options.collections) {
    const fields = Object.entries(collection.fields)
      .filter(
        ([, field]) => field.kind === 'taxonomy' && field.options.of === options.taxonomy.name,
      )
      .map(([key]) => key)
    if (fields.length === 0) continue
    const store = options.storeFor(collection)
    let cursor: string | null = null
    do {
      if (scanned >= maxEntries) return Number.POSITIVE_INFINITY
      const page = await store.list({
        state: 'working',
        trashed: 'include',
        limit: Math.min(100, maxEntries - scanned),
        ...(cursor === null ? {} : { cursor }),
      })
      scanned += page.items.length
      for (const entry of page.items) {
        const carries = fields.some((key) => {
          const value: unknown = entry.values[key]
          return Array.isArray(value) ? value.includes(options.termId) : value === options.termId
        })
        if (carries) count += 1
      }
      cursor = page.hasMore ? page.nextCursor : null
    } while (cursor !== null)
  }
  return count
}
