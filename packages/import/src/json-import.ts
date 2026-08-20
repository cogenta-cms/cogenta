import { CogentaError } from '@cogenta/core'
import type { CollectionDefinition, ContentStore } from '@cogenta/schema'
import type { ImportTrackingStore } from './tracking.js'

/**
 * JSON import (fiche 25 task 5): one Cogenta site's content, moved into
 * another.
 *
 * The format is intentionally minimal and self-contained — newline-delimited
 * JSON, one entry per line, `{ collection, id?, status?, locale?, values }` —
 * rather than a reuse of `@cogenta/export`'s own NDJSON format: that package
 * is not present in this branch (no `packages/export`), so there is no
 * `export@1.0` writer to round-trip against yet. This reader is written to
 * the shape that format's manifest already documents (collection, id,
 * status, locale, values are exactly its `entry` record's own fields), so
 * once `@cogenta/export` lands, wiring this import to consume its real
 * stream is a matter of mapping its `ExportEntryRecord` onto
 * `JsonImportRecord`, not a rewrite.
 */

export interface JsonImportRecord {
  readonly collection: string
  /** Present on a real Cogenta export; absent on a hand-written JSON import, where the store assigns one. */
  readonly id?: string
  readonly status?: 'draft' | 'published' | 'archived'
  readonly locale?: string
  readonly values: Readonly<Record<string, unknown>>
}

function invalidLine(lineNumber: number, reason: string): CogentaError {
  return new CogentaError({
    code: 'IMPORT_SOURCE_INVALID',
    message: `Line ${lineNumber} of the JSON import is not usable: ${reason}.`,
    hint: 'Each line must be a JSON object shaped { "collection": "...", "values": { ... } }.',
    details: { line: lineNumber },
  })
}

export function parseJsonImport(text: string): readonly JsonImportRecord[] {
  const records: JsonImportRecord[] = []
  const lines = text.split(/\r\n|\n/)

  lines.forEach((line, index) => {
    if (line.trim().length === 0) return
    const lineNumber = index + 1

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      throw invalidLine(lineNumber, 'not valid JSON')
    }

    if (typeof parsed !== 'object' || parsed === null)
      throw invalidLine(lineNumber, 'not a JSON object')
    const record = parsed as Record<string, unknown>
    if (typeof record['collection'] !== 'string' || record['collection'].length === 0) {
      throw invalidLine(lineNumber, 'missing a "collection" name')
    }
    if (typeof record['values'] !== 'object' || record['values'] === null) {
      throw invalidLine(lineNumber, 'missing a "values" object')
    }

    records.push({
      collection: record['collection'],
      ...(typeof record['id'] === 'string' ? { id: record['id'] } : {}),
      ...(record['status'] === 'draft' ||
      record['status'] === 'published' ||
      record['status'] === 'archived'
        ? { status: record['status'] }
        : {}),
      ...(typeof record['locale'] === 'string' ? { locale: record['locale'] } : {}),
      values: record['values'] as Record<string, unknown>,
    })
  })

  return records
}

export interface JsonPreviewReport {
  readonly totalRecords: number
  readonly byCollection: Readonly<Record<string, number>>
  /** A collection this site does not declare — the record will be skipped and named at apply time, never dropped silently. */
  readonly unknownCollections: readonly string[]
  readonly warnings: readonly string[]
}

export function analyzeJson(
  records: readonly JsonImportRecord[],
  collections: readonly CollectionDefinition[],
): JsonPreviewReport {
  const known = new Set(collections.map((c) => c.name))
  const byCollection: Record<string, number> = {}
  const unknown = new Set<string>()

  for (const record of records) {
    byCollection[record.collection] = (byCollection[record.collection] ?? 0) + 1
    if (!known.has(record.collection)) unknown.add(record.collection)
  }

  const warnings: string[] = []
  if (unknown.size > 0) {
    warnings.push(
      `${[...unknown].join(', ')} — not declared on this site; those records will be skipped.`,
    )
  }

  return {
    totalRecords: records.length,
    byCollection,
    unknownCollections: [...unknown],
    warnings,
  }
}

export interface ApplyJsonOptions {
  readonly records: readonly JsonImportRecord[]
  readonly collections: readonly CollectionDefinition[]
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  readonly tracking: ImportTrackingStore
  readonly runId: string
  readonly createdBy: string | null
}

export interface JsonApplyReport {
  readonly imported: number
  readonly resumedSkips: number
  readonly errors: readonly { readonly sourceId: string; readonly message: string }[]
}

export async function applyJson(options: ApplyJsonOptions): Promise<JsonApplyReport> {
  const collectionByName = new Map(options.collections.map((c) => [c.name, c] as const))
  const done = await options.tracking.doneSourceIds(options.runId)

  let imported = 0
  let resumedSkips = 0
  const errors: { sourceId: string; message: string }[] = []

  for (const [index, record] of options.records.entries()) {
    const sourceId = record.id ?? `line:${index + 1}`
    if (done.has(sourceId)) {
      resumedSkips += 1
      continue
    }

    const collection = collectionByName.get(record.collection)
    if (collection === undefined) {
      errors.push({
        sourceId,
        message: `Collection "${record.collection}" does not exist on this site.`,
      })
      continue
    }

    try {
      const store = options.storeFor(collection)
      const entry = await store.create({
        ...(record.id === undefined ? {} : { id: record.id }),
        ...(record.status === undefined ? {} : { status: record.status }),
        ...(record.locale === undefined ? {} : { locale: record.locale }),
        createdBy: options.createdBy,
        values: record.values,
      })
      await options.tracking.recordItem({
        runId: options.runId,
        sourceId,
        collection: collection.name,
        entryId: entry.id,
      })
      imported += 1
    } catch (error) {
      errors.push({ sourceId, message: error instanceof Error ? error.message : String(error) })
    }
  }

  return { imported, resumedSkips, errors }
}
