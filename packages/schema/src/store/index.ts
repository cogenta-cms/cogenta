/**
 * The content persistence layer: CRUD, drafts, versions, diff and i18n.
 *
 * Everything here is portable across Postgres, MySQL, MariaDB and SQLite by
 * going through `DatabaseHandle` from `@cogenta/core`. No dialect difference
 * leaks past this folder, and no SQL is written outside it.
 */

export type {
  AdminThemeRecord,
  AdminThemeStore,
  AdminThemeStoreOptions,
} from './admin-theme-store.js'
export { createAdminThemeStore } from './admin-theme-store.js'
export {
  ADMIN_THEME_OVERRIDES_LENGTH,
  ADMIN_THEME_SINGLETON_ID,
  ADMIN_THEME_TABLE,
  ensureAdminThemeTable,
} from './admin-theme-tables.js'
export type {
  AdminThemeColorTokens,
  AdminThemeFontOption,
  AdminThemeOverrides,
  AdminThemeRadiusTokens,
  AdminThemeTemplate,
  AdminThemeTemplateId,
} from './admin-theme-templates.js'
export {
  ADMIN_THEME_FONTS,
  ADMIN_THEME_TEMPLATE_IDS,
  ADMIN_THEME_TEMPLATES,
  adminThemeFontById,
  adminThemeOverridesSchema,
  adminThemeTemplateById,
  DEFAULT_ADMIN_THEME_TEMPLATE_ID,
} from './admin-theme-templates.js'
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
export type {
  BlockChange,
  ChangeKind,
  ContentDiff,
  FieldChange,
  WordChange,
  WordOp,
} from './diff.js'
export {
  deepEqual,
  diffBlocks,
  diffBlockZones,
  diffContent,
  diffValues,
  diffWords,
  enrichWordDiffs,
  extractPlainText,
} from './diff.js'
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
  ReorderUpdate as MenuReorderUpdate,
  UpdateMenuInput,
  UpdateMenuItemInput,
} from './menu-store.js'
export { createMenuStore, MAX_MENU_DEPTH } from './menu-store.js'
export {
  ensureMenuTables,
  MENU_ITEM_PATH_LENGTH,
  MENU_LOCATION_LENGTH,
  MENU_TABLES,
} from './menu-tables.js'
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
export type { RedirectTrackingOptions } from './redirect-tracking.js'
export { withRedirectTracking } from './redirect-tracking.js'
export type { ReviewTransitionRule } from './review-transitions.js'
export { nextReviewState, REVIEW_TRANSITION_TABLE } from './review-transitions.js'
export type {
  RolePermissionExportFile,
  RolePermissionExportRow,
} from './role-permission-export.js'
export {
  parseRolePermissionExport,
  ROLE_PERMISSION_EXPORT_VERSION,
  serialiseRolePermissionExport,
} from './role-permission-export.js'
export type { RolePermissionOverlay, RolePermissionOverrides } from './role-permission-overlay.js'
export { createRolePermissionOverlay } from './role-permission-overlay.js'
export type {
  RolePermissionOverrideRecord,
  RolePermissionStore,
  RolePermissionStoreOptions,
  RolePermissionTargetType,
  SetRolePermissionInput,
} from './role-permission-store.js'
export { createRolePermissionStore } from './role-permission-store.js'
export { ensureRolePermissionTable, ROLE_PERMISSIONS_TABLE } from './role-permission-tables.js'
export type { ScheduledPublishEnqueueOptions } from './scheduled-publish-enqueue.js'
export { withScheduledPublishEnqueue } from './scheduled-publish-enqueue.js'
export type {
  ScheduledPublishFailure,
  ScheduledPublishFailureStore,
} from './scheduled-publish-failures.js'
export {
  createScheduledPublishFailureStore,
  SCHEDULED_PUBLISH_FAILURES_TABLE,
} from './scheduled-publish-failures.js'
export type { Schema21MigrationOptions } from './schema-2-1-migration.js'
export { schema21Migration } from './schema-2-1-migration.js'
export type { Schema2MigrationOptions } from './schema-2-migration.js'
export { schema2Migration } from './schema-2-migration.js'
export type { SearchIndexingOptions } from './search-indexing.js'
export { reindexAll, reindexEntry, withSearchIndexing } from './search-indexing.js'
export type {
  SiteSettingDefinition,
  SiteSettingGroup,
  SiteSettingScope,
  SiteSettingUiType,
} from './site-settings-registry.js'
export {
  SITE_SETTING_GROUPS,
  SITE_SETTING_SCOPES,
  SITE_SETTING_UI_TYPES,
  SITE_SETTINGS_REGISTRY,
  siteSettingByKey,
} from './site-settings-registry.js'
export type {
  SiteSettingRecord,
  SiteSettingsStore,
  SiteSettingsStoreOptions,
} from './site-settings-store.js'
export { createSiteSettingsStore } from './site-settings-store.js'
export {
  ensureSiteSettingsTables,
  SITE_SETTING_VALUE_LENGTH,
  SITE_SETTINGS_SITE_SCOPE,
  SITE_SETTINGS_TABLE,
} from './site-settings-tables.js'
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
export type { CountTaxonomyUsageOptions, TermUsage } from './taxonomy-usage.js'
export { countTaxonomyUsage } from './taxonomy-usage.js'
export type {
  SetThemeOverridesInput,
  ThemeOverridesState,
  ThemeStore,
  ThemeStoreOptions,
} from './theme-store.js'
export { createThemeStore, ensureThemeTable, THEME_TABLE } from './theme-store.js'
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
  StatusCounts,
  TrashFilter,
  TrashOptions,
  UpdateInput,
  VersionSummary,
} from './types.js'
export type { NormalisedValues, NormaliseOptions } from './values.js'
export { decodeFieldValue, encodeFieldValue, normaliseBlocks, normaliseValues } from './values.js'
