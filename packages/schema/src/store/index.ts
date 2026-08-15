/**
 * The content persistence layer: CRUD, drafts, versions, diff and i18n.
 *
 * Everything here is portable across Postgres, MySQL, MariaDB and SQLite by
 * going through `DatabaseHandle` from `@cogenta/core`. No dialect difference
 * leaks past this folder, and no SQL is written outside it.
 */

export {
  booleanColumn,
  columnTypeFor,
  integerColumn,
  isColumnless,
  jsonColumn,
  onDeleteClause,
  textColumn,
  timestampColumn,
  uuidColumn,
} from './columns.js'
export type { Cursor } from './cursor.js'
export { decodeCursor, encodeCursor } from './cursor.js'
export type { BlockChange, ChangeKind, ContentDiff, FieldChange } from './diff.js'
export { deepEqual, diffBlocks, diffBlockZones, diffContent, diffValues } from './diff.js'
export type {
  ContentLifecycleEvent,
  ContentLifecycleEventName,
  LifecycleEventsOptions,
} from './lifecycle-events.js'
export { withLifecycleEvents } from './lifecycle-events.js'
export {
  blocksTable,
  columnFor,
  entriesTable,
  isSystemColumn,
  relationTable,
  SYSTEM_COLUMNS,
  toSnakeCase,
  versionsTable,
} from './naming.js'
export { withReadOnlyStore } from './read-only.js'
export type { SearchIndexingOptions } from './search-indexing.js'
export { withSearchIndexing } from './search-indexing.js'
export type { ContentStore, ContentStoreOptions } from './store.js'
export { createContentStore } from './store.js'
export type { RelationTarget } from './tables.js'
export {
  assertUsableFields,
  createSchemaTables,
  dropSchemaTables,
  orderByDependency,
  relationsOf,
} from './tables.js'
export type {
  BlockZones,
  ContentBlock,
  ContentEntry,
  ContentValues,
  CreateInput,
  DuplicateInput,
  EntryState,
  ListOptions,
  LocaleFallback,
  LocaleResolution,
  Page,
  PublishInput,
  ResolveLocaleOptions,
  SortField,
  SortOrder,
  UpdateInput,
  VersionSummary,
} from './types.js'
export type { NormalisedValues, NormaliseOptions } from './values.js'
export { decodeFieldValue, encodeFieldValue, normaliseBlocks, normaliseValues } from './values.js'
