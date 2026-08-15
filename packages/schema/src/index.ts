/**
 * `@cogenta/schema` — the content model, in code.
 *
 * Implements contract A, frozen at `schema@1.0`. The schema is the single
 * source of truth: types, migrations, the admin interface and the API are all
 * derived from what is declared here, and nothing is written twice.
 */

export { defineCollection, validateCollectionSet } from './define-collection.js'
export type { SchemaIssue } from './errors.js'
export { schemaError } from './errors.js'
export type {
  BlocksFieldOptions,
  MediaAcceptKind,
  MediaFieldOptions,
  NumberFieldOptions,
  RelationFieldOptions,
  SelectChoice,
  SelectFieldOptions,
  SlugFieldOptions,
  TextFieldOptions,
} from './fields.js'
export { f, MEDIA_ACCEPT_KINDS } from './fields.js'
export type {
  SchemaDocument,
  SchemaDocumentAdmin,
  SchemaDocumentCollection,
  SchemaDocumentField,
} from './generate-schema-json.js'
export {
  buildSchemaDocument,
  renderSchemaJson,
  SCHEMA_DOCUMENT_CONTRACT,
} from './generate-schema-json.js'
export { interfaceName, renderTypeDeclarations } from './generate-types.js'
export { isUuidV7, newId, timestampOf } from './id.js'
export * from './links/index.js'
export type {
  RichTextBlock,
  RichTextDecorator,
  RichTextDocument,
  RichTextListItem,
  RichTextMarkDefinition,
  RichTextMediaNode,
  RichTextNode,
  RichTextSpan,
  RichTextStyle,
} from './rich-text.js'
export {
  RICH_TEXT_DECORATORS,
  RICH_TEXT_LIST_ITEMS,
  RICH_TEXT_STYLES,
  richTextDocumentSchema,
  richTextNodeSchema,
} from './rich-text.js'
export * from './routing/index.js'
export * from './scheduling/index.js'
export * from './search/index.js'
export * from './store/index.js'
export type { SystemFieldDescriptor, SystemFieldName } from './system-fields.js'
export {
  isSystemFieldName,
  provenanceDetailSchema,
  SYSTEM_FIELD_DESCRIPTORS,
  SYSTEM_FIELD_NAMES,
  systemFieldsSchema,
} from './system-fields.js'
export * from './types.js'
export type { GeoPoint, JsonValue, RawBlockInput } from './validation.js'
export {
  COLOR_PATTERN,
  collectionEntrySchema,
  collectionInputSchema,
  contentBlockSchema,
  fieldSchema,
  geoPointSchema,
  jsonValueSchema,
  SLUG_PATTERN,
} from './validation.js'
