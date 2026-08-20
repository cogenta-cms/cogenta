import type { CollectionDefinition, ContentEntry, ContentStore, EntryState } from '@cogenta/schema'
import { relationsOf } from '@cogenta/schema'

/**
 * The wire shape of an entry, and the deep expansion built on top of it.
 *
 * System fields stay at the top level and declared fields stay under `values`,
 * so a collection can declare a field called `status` or `version` without
 * colliding with the engine's own — and so a client can tell the two apart
 * without knowing the schema.
 *
 * Only REST calls `serialiseEntry` today, and that is on purpose rather than an
 * oversight: REST answers with a whole document, so it expands relations to
 * depth in one pass. GraphQL resolves a relation field only when the document
 * asks for it, through the dataloader — expanding eagerly there would defeat
 * both field selection and the batching the spec asks for. The two therefore
 * compose the *same* per-entry primitives differently, which is the seam this
 * package is built around. What sits in this file is the transport-neutral half:
 * the projection of an entry onto the wire, and a bounded walk over relations.
 */
export interface SerialisedEntry {
  readonly id: string
  readonly collection: string
  readonly locale: string
  readonly status: string
  /**
   * When this entry went to the trash, `null` while it has not (`schema@2.0`,
   * ADR-0022). Orthogonal to `status`: a trashed article that was published
   * still reads `published` here, which is what makes restoring it honest.
   */
  readonly deletedAt: string | null
  /** The editorial workflow's state (`schema@2.1`, ADR-0027). `'none'` on a collection that never turned it on. */
  readonly reviewState: ContentEntry['reviewState']
  readonly assignedReviewer: string | null
  readonly state: EntryState
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly createdBy: string | null
  readonly updatedBy: string | null
  readonly translationOf: string | null
  readonly publishedAt: string | null
  readonly provenance: string
  readonly provenanceDetail: ContentEntry['provenanceDetail']
  readonly values: Readonly<Record<string, unknown>>
  readonly blocks: ContentEntry['blocks']
}

/**
 * What expansion needs from the outside: how to find a collection, how to read
 * it, and whether this actor may. It is an interface rather than the service
 * itself so a transport can supply a batching implementation without this file
 * changing.
 */
export interface ExpansionSource {
  collection(name: string): CollectionDefinition | undefined
  store(collection: CollectionDefinition): ContentStore
  canRead(collection: CollectionDefinition): boolean
  canReadUnpublished(collection: CollectionDefinition): boolean
  /**
   * Per-entry check, asked once the entry is known.
   *
   * `canReadUnpublished` is told the collection and nothing else, so it cannot
   * tell a preview grant for entry A from one for entry B. Expansion is a read
   * path that returns entries, so it has to ask this too or a token issued for
   * one entry would unlock every draft it relates to.
   */
  canSeeEntry(collection: CollectionDefinition, entry: ContentEntry): boolean
}

export interface ExpansionOptions {
  /** Remaining hops. Zero leaves relations as identifiers. */
  readonly depth: number
  readonly state: EntryState
}

export async function serialiseEntry(
  entry: ContentEntry,
  collection: CollectionDefinition,
  source: ExpansionSource,
  options: ExpansionOptions,
): Promise<SerialisedEntry> {
  const values = await expand(entry, collection, source, options, new Set([key(collection, entry)]))
  return { ...projectionOf(entry, collection.name), values }
}

/**
 * The system half of the wire shape, in one place.
 *
 * A root entry and an expanded related entry are the same document; writing the
 * field list twice is how one of them quietly loses `provenance` after a schema
 * change.
 */
function projectionOf(
  entry: ContentEntry,
  collectionName: string,
): Omit<SerialisedEntry, 'values'> {
  return {
    id: entry.id,
    collection: collectionName,
    locale: entry.locale,
    status: entry.status,
    deletedAt: entry.deletedAt,
    reviewState: entry.reviewState,
    assignedReviewer: entry.assignedReviewer,
    state: entry.state,
    version: entry.version,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    createdBy: entry.createdBy,
    updatedBy: entry.updatedBy,
    translationOf: entry.translationOf,
    publishedAt: entry.publishedAt,
    provenance: entry.provenance,
    provenanceDetail: entry.provenanceDetail,
    blocks: entry.blocks,
  }
}

function key(collection: CollectionDefinition, entry: ContentEntry): string {
  return `${collection.name}:${entry.id}`
}

/**
 * Replaces relation identifiers with entries, down to `depth` hops.
 *
 * Two guards, and both are needed. The depth bound stops a long chain; the
 * `seen` set stops a *short* cycle from consuming the whole budget on two
 * entries pointing at each other, which is the case the spec warns about.
 */
async function expand(
  entry: ContentEntry,
  collection: CollectionDefinition,
  source: ExpansionSource,
  options: ExpansionOptions,
  seen: ReadonlySet<string>,
): Promise<Readonly<Record<string, unknown>>> {
  const relations = relationsOf(collection)
  if (options.depth <= 0 || relations.length === 0) return entry.values

  const values: Record<string, unknown> = { ...entry.values }

  for (const relation of relations) {
    const target = source.collection(relation.to)
    // An unknown or unreadable target is left as identifiers rather than
    // refused: a private relation must not make the whole entry unreadable,
    // and it must not leak its content either.
    if (target === undefined || !source.canRead(target)) continue

    const raw = values[relation.field]
    const next: ExpansionOptions = {
      depth: options.depth - 1,
      // Expansion never upgrades what is visible: reaching the working state of
      // a related collection requires that collection's own permission.
      state:
        options.state === 'working' && source.canReadUnpublished(target) ? 'working' : 'published',
    }

    if (relation.many) {
      if (!Array.isArray(raw)) continue
      const expanded: unknown[] = []
      for (const id of raw) {
        expanded.push(await one(id, target, source, next, seen))
      }
      values[relation.field] = expanded
      continue
    }

    if (typeof raw === 'string' && raw.length > 0) {
      values[relation.field] = await one(raw, target, source, next, seen)
    }
  }

  return values
}

async function one(
  id: unknown,
  target: CollectionDefinition,
  source: ExpansionSource,
  options: ExpansionOptions,
  seen: ReadonlySet<string>,
): Promise<unknown> {
  if (typeof id !== 'string' || id.length === 0) return id
  if (seen.has(`${target.name}:${id}`)) return id

  const found = await source.store(target).read(id, { state: options.state })
  // Null means "not visible in this state" as often as "gone": a draft related
  // entry read as `published` comes back null, and the identifier is all the
  // caller gets. That is the rule about drafts holding on every path.
  if (found === null) return id
  // And the entry-level check, for the draft a preview grant does not cover.
  // Only in the working state: a published read cannot have produced a draft.
  if (options.state === 'working' && !source.canSeeEntry(target, found)) return id

  const inner = new Set(seen)
  inner.add(`${target.name}:${found.id}`)
  const values = await expand(found, target, source, options, inner)

  return { ...projectionOf(found, target.name), values } satisfies SerialisedEntry
}
