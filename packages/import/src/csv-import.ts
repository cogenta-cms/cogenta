import { parseCsv } from './csv.js'
import type { GenericSourceRecord } from './generic-import.js'

/**
 * CSV as an import source (fiche 25 task 5).
 *
 * `sourceId` is the row number (1-based, header excluded): stable across a
 * re-analysis of the exact same file, which is what resume and undo rely on.
 * A CSV re-exported with rows reordered gets a fresh run rather than a false
 * resume — the same honest limit `parseCsv` itself does not try to solve.
 */
export function csvToRecords(text: string): readonly GenericSourceRecord[] {
  const { rows } = parseCsv(text)
  return rows.map((values, index) => ({ sourceId: String(index + 1), values }))
}
