import { CogentaError } from '@cogenta/core'
import type {
  BlockZones,
  ContentStatus,
  ContentValues,
  Provenance,
  SystemFields,
} from '@cogenta/schema'

/**
 * The export format — `export@1.0`.
 *
 * **A public format from the first version.** It will be read by scripts,
 * other sites and migrations, so it is versioned and documented
 * (`docs/04-contrats.md`) exactly like contracts A-D, even though the plan
 * that asked for this package did not require an ADR for it (only "a format
 * decision"). NDJSON for content — one entry, term, menu item or redirect per
 * line, so a multi-gigabyte export never has to be held in memory to be read
 * or written — with the manifest as the stream's own first line, so the whole
 * export is one file rather than two that can drift apart.
 */
export const EXPORT_FORMAT = 'cogenta-export' as const
export const EXPORT_FORMAT_VERSION = '1.0' as const

export interface ExportSelection {
  /** Collection names included. Absent means every collection the actor may read. */
  readonly collections?: readonly string[]
  readonly statuses?: readonly ContentStatus[]
  readonly locales?: readonly string[]
  /** ISO 8601. Filters on `updatedAt`. */
  readonly from?: string
  readonly to?: string
  readonly includeTrashed?: boolean
  readonly includeHistory?: boolean
}

export interface ExportManifestRecord {
  readonly kind: 'manifest'
  readonly format: typeof EXPORT_FORMAT
  readonly version: typeof EXPORT_FORMAT_VERSION
  readonly createdAt: string
  readonly site: { readonly name: string; readonly url: string }
  readonly selection: ExportSelection
  readonly counts: {
    readonly entries: number
    readonly terms: number
    readonly menus: number
    readonly menuItems: number
    readonly redirects: number
    readonly mediaRefs: number
  }
}

export interface ExportEntryRecord {
  readonly kind: 'entry'
  readonly collection: string
  readonly id: string
  readonly locale: string
  readonly translationOf: string | null
  readonly status: ContentStatus
  readonly deletedAt: string | null
  readonly version: number
  readonly provenance: Provenance
  readonly provenanceDetail: SystemFields['provenanceDetail']
  readonly createdAt: string
  readonly updatedAt: string
  readonly createdBy: string | null
  readonly updatedBy: string | null
  readonly publishedAt: string | null
  readonly values: ContentValues
  readonly blocks: BlockZones
}

/**
 * One version of an entry's history — only emitted when `includeHistory` is
 * set. Metadata only: `ContentStore.history()` itself does not return each
 * version's field snapshot, only who changed what and when, which is exactly
 * what a history *listing* needs and all this record carries.
 */
export interface ExportVersionRecord {
  readonly kind: 'version'
  readonly collection: string
  readonly entryId: string
  readonly version: number
  readonly status: ContentStatus
  readonly createdAt: string
  readonly createdBy: string | null
}

export interface ExportTermRecord {
  readonly kind: 'term'
  readonly taxonomy: string
  readonly id: string
  readonly slug: string
  readonly parent: string | null
  readonly position: number
  readonly labels: Readonly<Record<string, string>>
}

export interface ExportMenuRecord {
  readonly kind: 'menu'
  readonly id: string
  readonly name: string
  readonly locale: string
  readonly label: string
}

export interface ExportMenuItemRecord {
  readonly kind: 'menu-item'
  readonly id: string
  readonly menuId: string
  readonly parent: string | null
  readonly position: number
  readonly label: string
  readonly itemKind: string
  readonly url: string | null
  readonly targetCollection: string | null
  readonly targetEntryId: string | null
  readonly openInNewTab: boolean
}

export interface ExportRedirectRecord {
  readonly kind: 'redirect'
  readonly from: string
  readonly to: string
  readonly status: number
  readonly collection: string | null
  readonly entryId: string | null
  readonly locale: string | null
  readonly reason: string
}

/** A reference to a medium used by an exported entry — never the bytes (task 1 vs task 2). */
export interface ExportMediaRefRecord {
  readonly kind: 'media-ref'
  readonly id: string
  readonly filename: string
  readonly mimeType: string
  readonly size: number
  readonly storageKey: string
}

export type ExportRecord =
  | ExportManifestRecord
  | ExportEntryRecord
  | ExportVersionRecord
  | ExportTermRecord
  | ExportMenuRecord
  | ExportMenuItemRecord
  | ExportRedirectRecord
  | ExportMediaRefRecord

export function encodeRecord(record: ExportRecord): string {
  return `${JSON.stringify(record)}\n`
}

/** Reads NDJSON, one `ExportRecord` per non-blank line. Throws on the first malformed line, naming it. */
export function decodeRecord(line: string, lineNumber: number): ExportRecord {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch (cause) {
    throw new CogentaError({
      code: 'EXPORT_FORMAT_INVALID',
      message: `Line ${lineNumber} of the export is not valid JSON.`,
      hint: 'The file is corrupt or was not produced by `cogenta export`/`@cogenta/export`.',
      cause,
      details: { lineNumber },
    })
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { kind?: unknown }).kind !== 'string'
  ) {
    throw new CogentaError({
      code: 'EXPORT_FORMAT_INVALID',
      message: `Line ${lineNumber} of the export has no "kind".`,
      hint: 'The file is corrupt or was not produced by `cogenta export`/`@cogenta/export`.',
      details: { lineNumber },
    })
  }
  return parsed as ExportRecord
}

export function assertManifest(
  record: ExportRecord | undefined,
): asserts record is ExportManifestRecord {
  if (record === undefined || record.kind !== 'manifest') {
    throw new CogentaError({
      code: 'EXPORT_FORMAT_INVALID',
      message: 'The export does not start with a manifest record.',
      hint: 'The first line of a Cogenta export must be `{"kind":"manifest",…}`.',
    })
  }
  if (record.format !== EXPORT_FORMAT) {
    throw new CogentaError({
      code: 'EXPORT_FORMAT_INVALID',
      message: `Unknown export format "${record.format}".`,
      hint: `This reader only understands "${EXPORT_FORMAT}".`,
      details: { format: record.format },
    })
  }
  if (record.version.split('.')[0] !== EXPORT_FORMAT_VERSION.split('.')[0]) {
    throw new CogentaError({
      code: 'BACKUP_VERSION_UNSUPPORTED',
      message: `Export format ${record.version} is not compatible with this reader (${EXPORT_FORMAT_VERSION}).`,
      hint: 'A major version bump of the export format is a breaking change; use a matching version of @cogenta/export.',
      details: { found: record.version, supported: EXPORT_FORMAT_VERSION },
    })
  }
}
