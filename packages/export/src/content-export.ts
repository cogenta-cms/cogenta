import type { DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentStore,
  type MenuStore,
  orderByDependency,
  type RedirectStore,
  type TaxonomyDefinition,
  type TaxonomyStore,
} from '@cogenta/schema'
import {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  type ExportManifestRecord,
  type ExportMenuItemRecord,
  type ExportMenuRecord,
  type ExportRedirectRecord,
  type ExportSelection,
  type ExportTermRecord,
  type ExportVersionRecord,
  encodeRecord,
} from './format.js'

export interface ExportContentOptions {
  readonly db: DatabaseHandle
  readonly site: { readonly name: string; readonly url: string }
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  readonly taxonomyStoreFor: (taxonomy: TaxonomyDefinition) => TaxonomyStore
  readonly menus?: MenuStore
  readonly redirects?: RedirectStore
  readonly selection?: ExportSelection
  /**
   * A read is exported only when this returns `true` (R4 — the same rule
   * every other route enforces, applied here so an export can never become
   * an exfiltration path the way `GET /api/media` was before L10). Defaults
   * to "always readable", which is correct for a CLI running as the site's
   * own operator and wrong for anything reachable over HTTP — the API layer
   * always supplies a real check, built from the same `PermissionLayer`
   * every other route uses.
   */
  readonly canReadCollection?: (collection: CollectionDefinition) => boolean
  readonly canReadTaxonomy?: (taxonomy: TaxonomyDefinition) => boolean
  readonly now?: () => Date
}

export interface ExportResult {
  readonly counts: ExportManifestRecord['counts']
  /** Media ids referenced by an exported `media` field — task 2's input. */
  readonly mediaIds: readonly string[]
}

const PAGE_SIZE = 200

function inSelection(selection: ExportSelection | undefined, name: string): boolean {
  if (selection?.collections === undefined) return true
  return selection.collections.includes(name)
}

function mediaIdsOf(value: unknown): readonly string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  return []
}

/**
 * Streams a whole export as NDJSON text, one `ExportRecord` per line, and
 * resolves to the exact counts and the set of referenced media ids once every
 * record has been produced.
 *
 * The manifest is the **first** line rather than a sibling file: a two-file
 * export can drift out of step (one gets copied, the other does not), one
 * stream cannot. Its `counts` are written as zero and are informational only
 * on this first pass — a reader that needs exact counts before it starts
 * reads `exportContentToLines`'s returned `ExportResult` instead, which is
 * what `cogenta export` writes back into the manifest once the file is
 * seekable.
 */
export async function* exportContent(
  options: ExportContentOptions,
): AsyncGenerator<string, ExportResult> {
  const selection = options.selection ?? {}
  const canReadCollection = options.canReadCollection ?? (() => true)
  const canReadTaxonomy = options.canReadTaxonomy ?? (() => true)
  const now = options.now ?? (() => new Date())

  const counts = { entries: 0, terms: 0, menus: 0, menuItems: 0, redirects: 0, mediaRefs: 0 }
  const mediaSeen = new Set<string>()

  const manifest: ExportManifestRecord = {
    kind: 'manifest',
    format: EXPORT_FORMAT,
    version: EXPORT_FORMAT_VERSION,
    createdAt: now().toISOString(),
    site: options.site,
    selection,
    counts,
  }
  yield encodeRecord(manifest)

  // Taxonomies before collections, and collections in dependency order
  // (`orderByDependency`, the same helper `createSchemaTables` uses to
  // decide table creation order): a `f.taxonomy()` or `f.relation()` field
  // is a foreign key, and `content-import.ts` replays this exact stream in a
  // single forward pass rather than buffering it, so whatever it needs to
  // already exist has to have been emitted already.
  for (const taxonomy of options.taxonomies) {
    if (!canReadTaxonomy(taxonomy)) continue

    const store = options.taxonomyStoreFor(taxonomy)
    const terms = await store.list()
    for (const term of terms) {
      counts.terms += 1
      const record: ExportTermRecord = {
        kind: 'term',
        taxonomy: taxonomy.name,
        id: term.id,
        slug: term.slug,
        parent: term.parent,
        position: term.position,
        labels: term.labels,
      }
      yield encodeRecord(record)
    }
  }

  for (const collection of orderByDependency(options.collections)) {
    if (!inSelection(selection, collection.name)) continue
    if (!canReadCollection(collection)) continue

    const mediaFields = Object.entries(collection.fields)
      .filter(([, field]) => field.kind === 'media')
      .map(([name]) => name)

    const store = options.storeFor(collection)
    let cursor: string | undefined
    for (;;) {
      const page = await store.list({
        state: 'working',
        limit: PAGE_SIZE,
        trashed: selection.includeTrashed === true ? 'include' : 'exclude',
        ...(cursor === undefined ? {} : { cursor }),
      })

      for (const entry of page.items) {
        if (selection.statuses !== undefined && !selection.statuses.includes(entry.status)) {
          continue
        }
        if (selection.locales !== undefined && !selection.locales.includes(entry.locale)) {
          continue
        }
        if (selection.from !== undefined && entry.updatedAt < selection.from) continue
        if (selection.to !== undefined && entry.updatedAt > selection.to) continue

        counts.entries += 1
        yield encodeRecord({
          kind: 'entry',
          collection: collection.name,
          id: entry.id,
          locale: entry.locale,
          translationOf: entry.translationOf,
          status: entry.status,
          deletedAt: entry.deletedAt,
          version: entry.version,
          provenance: entry.provenance,
          provenanceDetail: entry.provenanceDetail ?? null,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          createdBy: entry.createdBy,
          updatedBy: entry.updatedBy,
          publishedAt: entry.publishedAt,
          values: entry.values,
          blocks: entry.blocks,
        })

        for (const field of mediaFields) {
          for (const id of mediaIdsOf(entry.values[field])) mediaSeen.add(id)
        }

        if (selection.includeHistory === true) {
          const history = await store.history(entry.id, { trashed: 'include' })
          for (const version of history) {
            const record: ExportVersionRecord = {
              kind: 'version',
              collection: collection.name,
              entryId: entry.id,
              version: version.version,
              status: version.status,
              createdAt: version.createdAt,
              createdBy: version.createdBy,
            }
            yield encodeRecord(record)
          }
        }
      }

      if (!page.hasMore || page.nextCursor === null) break
      cursor = page.nextCursor
    }
  }

  if (options.menus !== undefined) {
    const menus = await options.menus.list()
    for (const menu of menus) {
      counts.menus += 1
      const record: ExportMenuRecord = {
        kind: 'menu',
        id: menu.id,
        name: menu.name,
        locale: menu.locale,
        label: menu.label,
      }
      yield encodeRecord(record)

      const items = await options.menus.listItems(menu.id)
      for (const item of items) {
        counts.menuItems += 1
        const itemRecord: ExportMenuItemRecord = {
          kind: 'menu-item',
          id: item.id,
          menuId: menu.id,
          parent: item.parent,
          position: item.position,
          label: item.label,
          itemKind: item.kind,
          url: item.url,
          targetCollection: item.targetCollection,
          targetEntryId: item.targetEntryId,
          openInNewTab: item.openInNewTab,
        }
        yield encodeRecord(itemRecord)
      }
    }
  }

  if (options.redirects !== undefined) {
    const redirects = await options.redirects.list({ limit: 100_000 })
    for (const redirect of redirects) {
      counts.redirects += 1
      const record: ExportRedirectRecord = {
        kind: 'redirect',
        from: redirect.from,
        to: redirect.to,
        status: redirect.status,
        collection: redirect.collection,
        entryId: redirect.entryId,
        locale: redirect.locale,
        reason: redirect.reason,
      }
      yield encodeRecord(record)
    }
  }

  counts.mediaRefs = mediaSeen.size
  return { counts, mediaIds: [...mediaSeen] }
}
