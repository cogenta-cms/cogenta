import { CogentaError } from '@cogenta/core'
import type {
  CollectionDefinition,
  ContentStore,
  MenuStore,
  RedirectStore,
  TaxonomyDefinition,
  TaxonomyStore,
} from '@cogenta/schema'
import { assertManifest, decodeRecord, type ExportRecord } from './format.js'

export interface ImportContentOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  readonly taxonomyStoreFor: (taxonomy: TaxonomyDefinition) => TaxonomyStore
  readonly menus?: MenuStore
  readonly redirects?: RedirectStore
  /**
   * `'skip'` (the default): a record whose id already exists in the target is
   * left alone and counted in `report.skipped`. `'fail'` stops the whole
   * import at the first collision — appropriate for "restore a content
   * export into an empty site", where any collision means the site was not
   * actually empty and the caller should know before more damage is done.
   */
  readonly onConflict?: 'skip' | 'fail'
}

export interface ImportReport {
  readonly entries: number
  readonly terms: number
  readonly menus: number
  readonly menuItems: number
  readonly redirects: number
  readonly skipped: number
  readonly errors: readonly {
    readonly kind: string
    readonly id: string
    readonly message: string
  }[]
}

function emptyReport(): {
  entries: number
  terms: number
  menus: number
  menuItems: number
  redirects: number
  skipped: number
  errors: { kind: string; id: string; message: string }[]
} {
  return { entries: 0, terms: 0, menus: 0, menuItems: 0, redirects: 0, skipped: 0, errors: [] }
}

/**
 * Applies one line of an export stream at a time — the counterpart of
 * `exportContent`, replaying the exact ordering it committed to (taxonomies,
 * then collections in dependency order, then menus, then redirects) so a
 * forward-only pass never needs the row it has not seen yet.
 *
 * The one exception is a translation whose source entry appears later than
 * itself in the stream (possible when a store's default list order is not
 * strictly creation order): such an entry is deferred to a small pending
 * queue — bounded by how many translations are out of order, never by the
 * size of the export — and retried once the stream ends.
 */
export async function importContent(
  lines: AsyncIterable<string> | Iterable<string>,
  options: ImportContentOptions,
): Promise<ImportReport> {
  const onConflict = options.onConflict ?? 'skip'
  const report = emptyReport()

  const collectionByName = new Map(options.collections.map((c) => [c.name, c]))
  const taxonomyByName = new Map(options.taxonomies.map((t) => [t.name, t]))
  const pendingTranslations: Extract<ExportRecord, { kind: 'entry' }>[] = []
  let sawManifest = false
  let lineNumber = 0

  const applyEntry = async (
    record: Extract<ExportRecord, { kind: 'entry' }>,
    allowDefer = true,
  ): Promise<void> => {
    const collection = collectionByName.get(record.collection)
    if (collection === undefined) {
      report.errors.push({
        kind: 'entry',
        id: record.id,
        message: `Collection "${record.collection}" does not exist in the target site.`,
      })
      return
    }

    const store = options.storeFor(collection)
    const existing = await store.read(record.id, { state: 'working', trashed: 'include' })
    if (existing !== null) {
      if (onConflict === 'fail') {
        throw new CogentaError({
          code: 'RESTORE_CONFLICT',
          message: `Entry "${record.id}" of "${record.collection}" already exists in the target.`,
          hint: 'Import into an empty site, or pass onConflict: "skip".',
          details: { collection: record.collection, id: record.id },
        })
      }
      report.skipped += 1
      return
    }

    if (record.translationOf !== null) {
      const source = await store.read(record.translationOf, {
        state: 'working',
        trashed: 'include',
      })
      if (source === null) {
        if (allowDefer) pendingTranslations.push(record)
        return
      }
    }

    await store.create({
      id: record.id,
      locale: record.locale,
      translationOf: record.translationOf,
      status: record.status,
      createdBy: record.createdBy,
      provenance: record.provenance,
      ...(record.provenanceDetail === null ? {} : { provenanceDetail: record.provenanceDetail }),
      values: record.values,
      blocks: record.blocks,
    })

    if (record.deletedAt !== null) await store.delete(record.id)

    report.entries += 1
  }

  const applyRecord = async (record: ExportRecord): Promise<void> => {
    switch (record.kind) {
      case 'manifest':
        assertManifest(record)
        sawManifest = true
        return
      case 'entry':
        await applyEntry(record)
        return
      case 'version':
        // Version history is informational (task 1's "avec ou sans historique
        // de versions"); it is exported for archival reading, not replayed —
        // `ContentStore` has no "insert a past version" primitive, and
        // fabricating one would misreport who wrote what, when.
        return
      case 'term': {
        const taxonomy = taxonomyByName.get(record.taxonomy)
        if (taxonomy === undefined) {
          report.errors.push({
            kind: 'term',
            id: record.id,
            message: `Taxonomy "${record.taxonomy}" does not exist in the target site.`,
          })
          return
        }
        const store = options.taxonomyStoreFor(taxonomy)
        const existing = await store.read(record.id)
        if (existing !== null) {
          if (onConflict === 'fail') {
            throw new CogentaError({
              code: 'RESTORE_CONFLICT',
              message: `Term "${record.id}" of "${record.taxonomy}" already exists in the target.`,
              hint: 'Import into an empty site, or pass onConflict: "skip".',
            })
          }
          report.skipped += 1
          return
        }
        await store.create({
          id: record.id,
          slug: record.slug,
          labels: record.labels,
          parent: record.parent,
          position: record.position,
        })
        report.terms += 1
        return
      }
      case 'menu': {
        if (options.menus === undefined) return
        const existing = await options.menus.read(record.id)
        if (existing !== null) {
          if (onConflict === 'fail') {
            throw new CogentaError({
              code: 'RESTORE_CONFLICT',
              message: `Menu "${record.id}" already exists in the target.`,
              hint: 'Import into an empty site, or pass onConflict: "skip".',
            })
          }
          report.skipped += 1
          return
        }
        await options.menus.create({
          id: record.id,
          name: record.name,
          locale: record.locale,
          label: record.label,
        })
        report.menus += 1
        return
      }
      case 'menu-item': {
        if (options.menus === undefined) return
        const existing = await options.menus.readItem(record.id)
        if (existing !== null) {
          report.skipped += 1
          return
        }
        await options.menus.createItem(record.menuId, {
          id: record.id,
          label: record.label,
          kind: record.itemKind as 'entry' | 'url' | 'submenu-placeholder',
          parent: record.parent,
          targetCollection: record.targetCollection,
          targetEntryId: record.targetEntryId,
          url: record.url,
          position: record.position,
          openInNewTab: record.openInNewTab,
        })
        report.menuItems += 1
        return
      }
      case 'redirect': {
        if (options.redirects === undefined) return
        await options.redirects.add({
          from: record.from,
          to: record.to,
          status: record.status as 301 | 302,
          reason: 'import',
          ...(record.collection === null ? {} : { collection: record.collection }),
          ...(record.entryId === null ? {} : { entryId: record.entryId }),
          ...(record.locale === null ? {} : { locale: record.locale }),
        })
        report.redirects += 1
        return
      }
      default:
        return
    }
  }

  for await (const line of lines) {
    if (line.trim().length === 0) continue
    lineNumber += 1
    const record = decodeRecord(line, lineNumber)
    await applyRecord(record)
  }

  if (!sawManifest) {
    throw new CogentaError({
      code: 'EXPORT_FORMAT_INVALID',
      message: 'The import stream never carried a manifest record.',
      hint: 'The first line of a Cogenta export must be `{"kind":"manifest",…}`.',
    })
  }

  // Retry deferred translations, in the order they were deferred. A source
  // that is itself still missing after this pass is a genuinely broken
  // export (a translation whose source was never included) rather than an
  // ordering artefact, and is reported as an error instead of retried forever.
  for (const record of [...pendingTranslations]) {
    const entriesBefore = report.entries
    const skippedBefore = report.skipped
    await applyEntry(record, false)
    if (report.entries === entriesBefore && report.skipped === skippedBefore) {
      report.errors.push({
        kind: 'entry',
        id: record.id,
        message: `Translation source "${record.translationOf}" was never found in the export.`,
      })
    }
  }

  return report
}
