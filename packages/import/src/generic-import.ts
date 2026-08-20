import type { CollectionDefinition, ContentStore } from '@cogenta/schema'
import { type FieldMapping, proposeFieldMapping, resolveMapping } from './mapping.js'
import type { ImportTrackingStore } from './tracking.js'

/**
 * The shared engine behind CSV and RSS/Atom import (fiche 25 task 5).
 *
 * Both sources reduce to the same shape once parsed — a list of records, each
 * with a stable `sourceId` and a bag of string values — so the mapping,
 * preview, apply, resume and undo machinery is written once here rather than
 * twice. WordPress keeps its own pipeline (`wordpress/import.ts`): its source
 * shape is not tabular, and forcing it through this engine would lose the
 * category/tag/media/author handling that is specific to it.
 */

export interface GenericSourceRecord {
  /** Stable across re-analysis of the same file — a CSV row number, an RSS item's guid/link. */
  readonly sourceId: string
  readonly values: Readonly<Record<string, string>>
}

export interface GenericPreviewReport {
  readonly totalRecords: number
  readonly sourceFields: readonly string[]
  readonly proposedMapping: FieldMapping
  /** The first few records, for the mapping/preview screen. */
  readonly sample: readonly Readonly<Record<string, string>>[]
  readonly warnings: readonly string[]
}

const SAMPLE_SIZE = 5

export function analyzeGeneric(
  records: readonly GenericSourceRecord[],
  targetCollection: CollectionDefinition,
): GenericPreviewReport {
  const sourceFields = records[0] === undefined ? [] : Object.keys(records[0].values)
  const warnings: string[] = []
  if (records.length === 0) {
    warnings.push('The source carries no importable record.')
  }

  return {
    totalRecords: records.length,
    sourceFields,
    proposedMapping: proposeFieldMapping(sourceFields, targetCollection),
    sample: records.slice(0, SAMPLE_SIZE).map((record) => record.values),
    warnings,
  }
}

export interface ApplyGenericOptions {
  readonly records: readonly GenericSourceRecord[]
  readonly mapping: FieldMapping
  readonly collections: readonly CollectionDefinition[]
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  readonly tracking: ImportTrackingStore
  readonly runId: string
  readonly createdBy: string | null
  readonly status?: 'draft' | 'published'
}

export interface GenericApplyReport {
  readonly imported: number
  /** Already recorded for this run — a resume, not a fresh write. */
  readonly resumedSkips: number
  readonly errors: readonly { readonly sourceId: string; readonly message: string }[]
}

/**
 * Writes every record not already recorded for this run.
 *
 * Resumable by construction: `tracking.doneSourceIds` is read once up front,
 * and every successful write is recorded before moving to the next record —
 * a process killed mid-run leaves a run whose next `applyGeneric` call picks
 * up exactly where it stopped, with no duplicate entries.
 */
export async function applyGeneric(options: ApplyGenericOptions): Promise<GenericApplyReport> {
  const resolved = resolveMapping(options.mapping, options.collections)
  const store = options.storeFor(resolved.collection)
  const done = await options.tracking.doneSourceIds(options.runId)

  let imported = 0
  let resumedSkips = 0
  const errors: { sourceId: string; message: string }[] = []

  for (const record of options.records) {
    if (done.has(record.sourceId)) {
      resumedSkips += 1
      continue
    }

    const values: Record<string, unknown> = {}
    for (const [source, target] of resolved.fields) {
      values[target] = record.values[source] ?? ''
    }

    try {
      const entry = await store.create({
        status: options.status ?? 'draft',
        createdBy: options.createdBy,
        values,
      })
      await options.tracking.recordItem({
        runId: options.runId,
        sourceId: record.sourceId,
        collection: resolved.collection.name,
        entryId: entry.id,
      })
      imported += 1
    } catch (error) {
      errors.push({
        sourceId: record.sourceId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { imported, resumedSkips, errors }
}
