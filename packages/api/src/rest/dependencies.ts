import { type BlockRegistry, vocabularyRegistry } from '@cogenta/blocks'
import type { CollectionDefinition } from '@cogenta/schema'
import type { SerialisedEntry } from '../content/index.js'

/**
 * What a response was actually built from.
 *
 * A render cache keyed on tags can only invalidate what it knows a page read,
 * and a client only knows what it *asked* for. Server-side relation expansion
 * breaks that: an article response carries its author inlined, the author's
 * identifier never crosses the client as a request of its own, so publishing a
 * new author name leaves the article page stale with no symptom at all. The
 * same holds for the media an entry and its blocks point at.
 *
 * So every response that carries entries also carries the identifiers that went
 * into it. It is derived from the serialised payload rather than recorded during
 * the read, which is what makes the access rule automatic instead of remembered:
 * an entry that the permission layer kept out of the response cannot appear
 * here, because there is nothing in the payload to derive it from.
 */
export interface ResponseDependencies {
  /**
   * Entries actually read, qualified as `<collection>:<id>`.
   *
   * Qualified because an identifier alone is ambiguous across collections, and a
   * cache tag that can collide is a cache that invalidates the wrong page.
   *
   * A relation left *unexpanded* is deliberately absent: its identifier is in
   * the payload, but the entry behind it was never read, and claiming it as a
   * dependency would have every article invalidated by every draft edit of an
   * author it merely links to.
   */
  readonly entries: readonly string[]
  /** Media identifiers referenced by the entries returned, blocks included. */
  readonly media: readonly string[]
  /**
   * Collections the response depends on as a whole.
   *
   * A list is not only its rows: an entry created or unpublished changes the
   * answer without any of the listed identifiers changing.
   */
  readonly collections: readonly string[]
}

export interface DependencySource {
  collection(name: string): CollectionDefinition | undefined
  /** Defaults to the twelve of contract B. A site with its own blocks passes its registry. */
  readonly blocks?: BlockRegistry
}

/**
 * Depth of the structural walk into a block's list fields.
 *
 * Two is what the vocabulary needs (a block, then its items); the bound exists
 * so that block data — which is stored JSON, not a validated shape at this point
 * — cannot turn one response into an unbounded traversal.
 */
const MAX_ITEM_DEPTH = 2

/**
 * The dependency set of a response.
 *
 * `queried` names the collections the request itself was addressed to, which is
 * how an empty list still declares what it depended on: without it, a page
 * showing "no results yet" would never be invalidated by the first entry.
 */
export function collectDependencies(
  entries: readonly SerialisedEntry[],
  source: DependencySource,
  queried: readonly string[] = [],
): ResponseDependencies {
  const found = {
    entries: new Set<string>(),
    media: new Set<string>(),
    collections: new Set(queried),
  }
  const registry = source.blocks ?? vocabularyRegistry

  for (const entry of entries) walkEntry(entry, found, source, registry)

  return {
    entries: [...found.entries].sort(),
    media: [...found.media].sort(),
    collections: [...found.collections].sort(),
  }
}

interface Found {
  readonly entries: Set<string>
  readonly media: Set<string>
  readonly collections: Set<string>
}

function walkEntry(
  entry: SerialisedEntry,
  found: Found,
  source: DependencySource,
  registry: BlockRegistry,
): void {
  const tag = `${entry.collection}:${entry.id}`
  // Relations can be circular (and expansion allows a cycle to appear twice at
  // different depths), so the set is also the visit guard.
  if (found.entries.has(tag)) return
  found.entries.add(tag)
  found.collections.add(entry.collection)

  const definition = source.collection(entry.collection)
  if (definition !== undefined) {
    for (const [name, field] of Object.entries(definition.fields)) {
      const value = entry.values[name]
      if (field.kind === 'media') addStrings(found.media, value)
      if (field.kind === 'relation') walkRelation(value, found, source, registry)
    }
  }

  for (const blocks of Object.values(entry.blocks)) {
    for (const block of blocks) walkBlock(block.type, block.data, found, registry)
  }
}

/** An expanded relation is an object with the wire shape; an identifier is a string. */
function walkRelation(
  value: unknown,
  found: Found,
  source: DependencySource,
  registry: BlockRegistry,
): void {
  if (Array.isArray(value)) {
    for (const item of value) walkRelation(item, found, source, registry)
    return
  }
  if (!isSerialised(value)) return
  walkEntry(value, found, source, registry)
}

function isSerialised(value: unknown): value is SerialisedEntry {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; collection?: unknown; values?: unknown }
  return typeof candidate.id === 'string' && typeof candidate.collection === 'string'
}

function walkBlock(
  type: string,
  data: Readonly<Record<string, unknown>>,
  found: Found,
  registry: BlockRegistry,
): void {
  const definition = registry.get(type)
  // An unknown block type — one a removed plugin left behind — contributes
  // nothing rather than failing the response: a stale cache tag is a smaller
  // problem than a page that cannot be served at all.
  if (definition === undefined) return

  for (const [name, field] of Object.entries(definition.schema)) {
    const value = data[name]
    if (field.kind === 'media') {
      addStrings(found.media, value)
      continue
    }
    // A list field carries raw item objects: contract B's item shapes are plain
    // zod schemas, so there is no declared kind to read here the way there is
    // for a block's own fields. The vocabulary names the media reference of an
    // item `media` (gallery items, logo items), and that name is what this
    // follows — structurally, and only inside a list of a known block.
    if (field.kind === 'json' || Array.isArray(value)) {
      addItemMedia(value, found.media, MAX_ITEM_DEPTH)
    }
  }
}

function addItemMedia(value: unknown, into: Set<string>, depth: number): void {
  if (depth <= 0) return

  if (Array.isArray(value)) {
    for (const item of value) addItemMedia(item, into, depth - 1)
    return
  }
  if (typeof value !== 'object' || value === null) return

  const media = (value as { media?: unknown }).media
  addStrings(into, media)
}

function addStrings(into: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.length > 0) {
    into.add(value)
    return
  }
  if (!Array.isArray(value)) return
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0) into.add(item)
  }
}
