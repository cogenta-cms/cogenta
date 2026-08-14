import { CogentaError } from '@cogenta/core'
import { z } from 'zod'
import { richTextDocumentSchema } from './rich-text.js'
import { systemFieldsSchema } from './system-fields.js'
import type { CollectionDefinition, FieldDefinition } from './types.js'

/**
 * Turns a field definition into the validator that guards every write.
 *
 * One validator derived from the schema, never a second hand-written one: the
 * schema is the single source of truth (L1 § "Génération"), and a validator
 * that drifts from it is worse than no validator at all.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

/**
 * Written out rather than taken from Zod's helper: a `json` column must hold
 * what `JSON.parse` can return and nothing else — no `undefined`, no `Date`,
 * no class instance that would come back as `{}` after a round-trip.
 */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)

export const geoPointSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().optional(),
})

export type GeoPoint = z.infer<typeof geoPointSchema>

/** Lowercase words joined by single hyphens: what a URL segment may contain. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** `#rgb`, `#rrggbb` or `#rrggbbaa`. A colour is data, never a CSS value (R3). */
export const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export const contentBlockSchema = z.looseObject({
  /** Stable for the life of the block: comments, diffs and RAG chunks key off it. */
  _key: z.string().min(1),
  _type: z.string().min(1),
})

/**
 * The raw `_key`/`_type` wire envelope a `blocks` field accepts on write —
 * distinct from the store's `ContentBlock` (`store/types.ts`, the normalised
 * `key`/`type`/`data` shape `BlockZones` holds after `values.ts` unwraps
 * this). Two types sharing the name `ContentBlock` used to collide in this
 * package's public exports, with this one silently winning over the store's
 * via `export *` — renamed so both are reachable under their own name.
 */
export type RawBlockInput = z.infer<typeof contentBlockSchema>

function idSchema(): z.ZodType<string> {
  // Every content id is an application-minted UUIDv7 (ADR-0015), so a reference
  // that is not uuid-shaped can only be a mistake.
  return z.uuid()
}

function selectValues(field: FieldDefinition): readonly string[] {
  const raw = field.options.options
  if (!Array.isArray(raw)) return []
  return raw.map((choice) =>
    typeof choice === 'object' && choice !== null && 'value' in choice
      ? String((choice as { value: unknown }).value)
      : String(choice),
  )
}

function numberOption(field: FieldDefinition, key: string): number | undefined {
  const value = field.options[key]
  return typeof value === 'number' ? value : undefined
}

/**
 * A field that holds several values is stored as rows in a join table, and a
 * join table cannot say "null" — it can only have no rows. So `required` on a
 * to-many field means "at least one", and its empty case is `[]`, never null.
 */
function manyOf<T extends z.ZodType>(item: T, field: FieldDefinition): z.ZodArray<T> {
  const array = z.array(item)
  return field.required === true ? array.min(1) : array
}

export function isCollectionValued(field: FieldDefinition): boolean {
  if (field.kind === 'blocks') return true
  const isManyKind = field.kind === 'media' || field.kind === 'relation' || field.kind === 'select'
  return isManyKind && field.options.many === true
}

function baseSchemaFor(field: FieldDefinition): z.ZodType {
  switch (field.kind) {
    case 'text': {
      let schema = z.string()
      const min = numberOption(field, 'min')
      const max = numberOption(field, 'max')
      if (min !== undefined) schema = schema.min(min)
      if (max !== undefined) schema = schema.max(max)
      return schema
    }
    case 'richText':
      return richTextDocumentSchema
    case 'slug': {
      let schema = z.string().regex(SLUG_PATTERN, 'must be lowercase words joined by hyphens')
      const max = numberOption(field, 'max')
      if (max !== undefined) schema = schema.max(max)
      return schema
    }
    case 'number': {
      let schema = field.options.integer === true ? z.number().int() : z.number().finite()
      const min = numberOption(field, 'min')
      const max = numberOption(field, 'max')
      if (min !== undefined) schema = schema.min(min)
      if (max !== undefined) schema = schema.max(max)
      return schema
    }
    case 'boolean':
      return z.boolean()
    case 'date':
      return z.iso.date()
    case 'datetime':
      return z.iso.datetime({ offset: true })
    case 'media':
    case 'relation':
      return field.options.many === true ? manyOf(idSchema(), field) : idSchema()
    case 'select': {
      const choice = z.enum(selectValues(field))
      return field.options.many === true ? manyOf(choice, field) : choice
    }
    case 'json':
      return jsonValueSchema
    case 'geo':
      return geoPointSchema
    case 'color':
      return z.string().regex(COLOR_PATTERN, 'must be a hex colour such as #1a2b3c')
    case 'blocks': {
      const allow = field.options.allow
      const blocks = manyOf(contentBlockSchema, field)
      if (allow === '*' || !Array.isArray(allow)) return blocks
      const allowed = new Set(allow.map(String))
      return blocks.superRefine((value, context) => {
        for (const [index, block] of value.entries()) {
          if (!allowed.has(block._type)) {
            context.addIssue({
              code: 'custom',
              message: `block "${block._type}" is not allowed here`,
              path: [index, '_type'],
            })
          }
        }
      })
    }
    default:
      throw new CogentaError({
        code: 'SCHEMA_INVALID',
        message: `Unknown field kind "${String(field.kind)}".`,
        hint: 'Build fields with the `f` constructors from @cogenta/schema.',
      })
  }
}

/**
 * The validator for one field, custom rule and optionality included.
 *
 * An optional field accepts `null` and an absent key alike: a form that never
 * showed the field and a form that cleared it mean the same thing to storage.
 */
export function fieldSchema(field: FieldDefinition): z.ZodType {
  let schema = baseSchemaFor(field)

  const { validate } = field
  if (validate !== undefined) {
    schema = schema.superRefine((value: unknown, context) => {
      const verdict = validate(value)
      if (verdict !== true) {
        context.addIssue({ code: 'custom', message: verdict })
      }
    })
  }

  if (field.required === true) return schema

  // Absent and null both mean "nothing was entered". They are normalised to one
  // stored shape so that a reader never has to handle two spellings of empty.
  return isCollectionValued(field)
    ? schema.nullish().transform((value) => value ?? [])
    : schema.nullish().transform((value) => value ?? null)
}

/** What an author may send: the declared fields, and nothing else. */
export function collectionInputSchema(collection: CollectionDefinition): z.ZodType {
  const shape: Record<string, z.ZodType> = {}
  for (const [name, field] of Object.entries(collection.fields)) {
    shape[name] = fieldSchema(field)
  }
  // Strict on purpose, as everywhere else in Cogenta: an unknown key is a typo
  // in a field name, and dropping it silently loses the editor's work.
  return z.strictObject(shape)
}

/** A stored entry: system fields plus the declared ones. */
export function collectionEntrySchema(collection: CollectionDefinition): z.ZodType {
  const shape: Record<string, z.ZodType> = {}
  for (const [name, field] of Object.entries(collection.fields)) {
    shape[name] = fieldSchema(field)
  }
  return systemFieldsSchema.extend(shape)
}
