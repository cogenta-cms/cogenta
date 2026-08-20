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
export type {
  MaintenanceState,
  MaintenanceStore,
  MaintenanceStoreOptions,
  SetMaintenanceInput,
} from './maintenance-store.js'
export {
  createMaintenanceStore,
  ensureMaintenanceTable,
  MAINTENANCE_TABLE,
} from './maintenance-store.js'
export type {
  CreateMenuInput,
  CreateMenuItemInput,
  ListMenusOptions,
  Menu,
  MenuItem,
  MenuItemKind,
  MenuStore,
  MenuStoreOptions,
  UpdateMenuInput,
  UpdateMenuItemInput,
} from './menu-store.js'
export { createMenuStore, MAX_MENU_DEPTH } from './menu-store.js'
export { ensureMenuTables, MENU_ITEM_PATH_LENGTH, MENU_TABLES } from './menu-tables.js'
export {
  blocksTable,
  columnFor,
  entriesTable,
  isSystemColumn,
  relationTable,
  SYSTEM_COLUMNS,
  taxonomyTable,
  toSnakeCase,
  versionsTable,
} from './naming.js'
export { withReadOnlyStore } from './read-only.js'
export type { ScheduledPublishEnqueueOptions } from './scheduled-publish-enqueue.js'
export { withScheduledPublishEnqueue } from './scheduled-publish-enqueue.js'
export type { Schema2MigrationOptions } from './schema-2-migration.js'
export { schema2Migration } from './schema-2-migration.js'
export type { SearchIndexingOptions } from './search-indexing.js'
export { reindexAll, reindexEntry, withSearchIndexing } from './search-indexing.js'
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
export {
  assertDepth,
  childPath,
  depthOf,
  isBelow,
  isWithin,
  MAX_TAXONOMY_DEPTH,
  rebasedPath,
  TAXONOMY_PATH_LENGTH,
} from './taxonomy-path.js'
export type {
  CreateTermInput,
  ListTermsOptions,
  TaxonomyStore,
  TaxonomyStoreOptions,
  UpdateTermInput,
} from './taxonomy-store.js'
export { createTaxonomyStore } from './taxonomy-store.js'
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
  PurgeReport,
  ReadOptions,
  ResolveLocaleOptions,
  SortField,
  SortOrder,
  TrashFilter,
  TrashOptions,
  UpdateInput,
  VersionSummary,
} from './types.js'
export type { NormalisedValues, NormaliseOptions } from './values.js'
export { decodeFieldValue, encodeFieldValue, normaliseBlocks, normaliseValues } from './values.js'
