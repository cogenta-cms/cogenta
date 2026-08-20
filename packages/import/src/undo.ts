import { CogentaError } from '@cogenta/core'
import type { CollectionDefinition, ContentStore } from '@cogenta/schema'
import type { ImportTrackingStore } from './tracking.js'

/**
 * Undoing an import (fiche 25 task 4): trash every entry recorded for a run.
 *
 * Trash, never `purge` — ADR-0022's whole point is that `delete()` leaves
 * every row in place, so `untrash()` can bring an over-eager undo back. A
 * run that has already been cancelled, or that was never applied, has no
 * items and undoes cleanly to nothing.
 */

export interface UndoImportOptions {
  readonly tracking: ImportTrackingStore
  readonly runId: string
  readonly storeFor: (collectionName: string) => ContentStore | undefined
  readonly collections?: readonly CollectionDefinition[]
}

export interface UndoImportReport {
  readonly trashed: number
  readonly alreadyGone: number
  readonly failed: readonly {
    readonly collection: string
    readonly entryId: string
    readonly reason: string
  }[]
}

export async function undoImport(options: UndoImportOptions): Promise<UndoImportReport> {
  const run = await options.tracking.getRun(options.runId)
  if (run === null) {
    throw new CogentaError({
      code: 'IMPORT_RUN_NOT_FOUND',
      message: `No import run "${options.runId}" exists.`,
      hint: 'Only a run that has been analyzed and applied can be cancelled.',
      details: { id: options.runId },
    })
  }

  const items = await options.tracking.listItems(options.runId)
  let trashed = 0
  let alreadyGone = 0
  const failed: { collection: string; entryId: string; reason: string }[] = []

  for (const item of items) {
    const store = options.storeFor(item.collection)
    if (store === undefined) {
      failed.push({
        collection: item.collection,
        entryId: item.entryId,
        reason: `Collection "${item.collection}" is no longer part of this site.`,
      })
      continue
    }
    try {
      const removed = await store.delete(item.entryId)
      if (removed) trashed += 1
      else alreadyGone += 1
    } catch (error) {
      failed.push({
        collection: item.collection,
        entryId: item.entryId,
        reason: error instanceof CogentaError ? error.message : String(error),
      })
    }
  }

  await options.tracking.updateRun(options.runId, {
    status: 'cancelled',
    report: { trashed, alreadyGone, failed },
  })

  return { trashed, alreadyGone, failed }
}
