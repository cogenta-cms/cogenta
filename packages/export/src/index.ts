/**
 * `@cogenta/export` — content export/import, site backup/restore, and the
 * GDPR export of one person's data (fiche 26).
 *
 * Three formats, deliberately not one: `export@1.0` (NDJSON content, this
 * package's own public, versioned format — task 1), a ZIP media archive
 * (task 2), and `cogenta-backup@1.0` (a ZIP of raw table dumps — task 3).
 * They share tooling (the ZIP writer/reader, the checksum, the optional
 * encryption) but are not interchangeable: an export respects permissions
 * and is safe to hand to a partner; a backup is the whole database,
 * including every password hash, and is not.
 */

export {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  type BackupManifest,
  type CreateBackupOptions,
  type CreateBackupResult,
  createBackup,
  dumpTable,
} from './backup.js'
export {
  type ExportContentOptions,
  type ExportResult,
  exportContent,
} from './content-export.js'
export { type ImportContentOptions, type ImportReport, importContent } from './content-import.js'
export { decryptStream, encryptStream } from './crypto.js'
export {
  assertManifest,
  decodeRecord,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  type ExportEntryRecord,
  type ExportManifestRecord,
  type ExportMediaRefRecord,
  type ExportMenuItemRecord,
  type ExportMenuRecord,
  type ExportRecord,
  type ExportRedirectRecord,
  type ExportSelection,
  type ExportTermRecord,
  type ExportVersionRecord,
  encodeRecord,
} from './format.js'
export {
  type ExportPersonalDataOptions,
  exportPersonalData,
  type PersonalDataAccount,
  type PersonalDataAccountLookup,
  type PersonalDataEntryRef,
  type PersonalDataExport,
  type PersonalDataGap,
  type PersonalDataOrderLookup,
  type PersonalDataOrderRef,
} from './gdpr.js'
export {
  exportMediaArchive,
  exportMediaReferences,
  type MediaArchiveOptions,
  type MediaExportOptions,
} from './media-export.js'
export {
  type ApplyRestoreOptions,
  applyRestore,
  previewRestore,
  type RestorePreviewTable,
  type RestoreReport,
  readBackupManifest,
  type VerifyBackupOptions,
  verifyBackup,
} from './restore.js'
export { type BuildBackupTablesOptions, buildBackupTables } from './tables.js'
export { openZip, type ZipEntry, type ZipReader } from './zip-reader.js'
export { type CreateZipWriterOptions, createZipWriter, type ZipWriter } from './zip-writer.js'
