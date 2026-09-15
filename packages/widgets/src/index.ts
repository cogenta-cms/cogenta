export type { WidgetAreaDeclaration } from './areas.js'
export {
  FOOTER_WIDGET_AREAS,
  isWidgetAreaId,
  STANDARD_WIDGET_AREAS,
  widgetAreasFor,
} from './areas.js'
export type {
  CreateWidgetInput,
  UpdateWidgetInput,
  Widget,
  WidgetStore,
  WidgetStoreOptions,
} from './store.js'
export { createWidgetStore, ensureWidgetTables, WIDGETS_TABLE } from './store.js'
export type { PageTarget, WidgetRequestContext, WidgetVisibility } from './visibility.js'
export {
  DEFAULT_VISIBILITY,
  isWidgetVisible,
  pageTargetSchema,
  targetMatches,
  validateWidgetVisibility,
  widgetVisibilitySchema,
} from './visibility.js'
export type { WidgetSettings, WidgetType } from './vocabulary.js'
export {
  DYNAMIC_WIDGET_TYPES,
  ENTRY_WIDGET_TYPES,
  isWidgetType,
  validateWidgetSettings,
  WIDGET_SETTINGS,
  WIDGET_TYPES,
} from './vocabulary.js'
