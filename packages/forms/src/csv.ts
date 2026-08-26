import type { FormSubmission } from './types.js'
import { isFormFileValue } from './types.js'

/**
 * Fiche 47 task 9 — the server-streamed CSV export. Deliberately mirrors
 * `packages/admin/src/lib/csv.ts` byte for byte rather than importing it (an
 * admin package is a browser bundle with React in its dependency tree;
 * `@cogenta/forms` is plain Node/ESM and must stay that way) — including the
 * CWE-1236 formula-injection guard, which is the one property a
 * non-regression test (fiche 47 task 9's own requirement) checks survives
 * the move from "build the whole CSV client-side" to "stream it from the
 * server". Any change here must be mirrored there, and vice versa.
 */

const FORMULA_LEADING_CHARS = new Set(['=', '+', '-', '@'])

export function csvField(value: string): string {
  const guarded = FORMULA_LEADING_CHARS.has(value.charAt(0)) ? `'${value}` : value
  if (/[",\n\r]/u.test(guarded)) {
    return `"${guarded.replace(/"/gu, '""')}"`
  }
  return guarded
}

export function toCsvRow(values: readonly string[]): string {
  return `${values.map(csvField).join(',')}\r\n`
}

function valueText(value: string | readonly string[] | undefined): string {
  if (value === undefined) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (isFormFileValue(value)) return value.filename
  return String(value)
}

/** The full set of value column names across a page of submissions, in first-seen order — same approach `form-submissions.tsx`'s client-side export already uses. */
export function csvValueColumns(submissions: readonly FormSubmission[]): readonly string[] {
  const seen = new Set<string>()
  for (const submission of submissions) {
    for (const key of Object.keys(submission.values)) seen.add(key)
  }
  return [...seen]
}

export function csvHeaderRow(valueColumns: readonly string[]): string {
  return toCsvRow(['id', 'form', 'status', 'submittedAt', 'referrer', ...valueColumns])
}

export function csvSubmissionRow(
  submission: FormSubmission,
  valueColumns: readonly string[],
): string {
  return toCsvRow([
    submission.id,
    submission.formName,
    submission.status,
    submission.submittedAt,
    submission.referrer ?? '',
    ...valueColumns.map((column) =>
      valueText(submission.values[column] as string | readonly string[] | undefined),
    ),
  ])
}

/** UTF-8 BOM, so Excel opens accented characters correctly — same reason `admin/src/lib/csv.ts`'s `downloadCsv` prepends one. */
export const CSV_BOM = '﻿'
