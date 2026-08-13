import { z } from 'zod'
import { plainTextSchema } from './plain-text.js'
import { type RichTextDocument, richTextDocumentSchema } from './rich-text.js'

/**
 * The field builders a block schema is written with.
 *
 * TEMPORARY. Contract B is explicit: a block describes its fields with **the
 * same `f.*` types as contract A** — one type system for content and for
 * blocks, one validator, one admin renderer, one target for generation. This
 * module is a local stand-in while `@cogenta/schema` is written in parallel; it
 * mirrors `FieldDefinition` from `@cogenta/schema/types` so the two are
 * structurally compatible, and must be replaced by `@cogenta/schema`'s `f` at
 * merge time.
 *
 * Only the nine kinds contract B allows in a block are exposed. `slug`, `date`,
 * `datetime`, `geo` and — above all — `blocks` are deliberately absent: nesting
 * is the gateway to a layout builder, which Cogenta is not (ADR-0009).
 */

/** Contract B, "Schéma d'un bloc". A strict subset of contract A's kinds. */
export const BLOCK_FIELD_KINDS = [
  'text',
  'richText',
  'number',
  'boolean',
  'media',
  'relation',
  'select',
  'color',
  'json',
] as const

export type BlockFieldKind = (typeof BLOCK_FIELD_KINDS)[number]

/** Mirrors `FieldAdminOptions` in `@cogenta/schema/types`. */
export interface FieldAdminOptions {
  readonly label?: string
  readonly help?: string
  readonly group?: string
  readonly showWhen?: { readonly field: string; readonly equals: unknown }
}

/**
 * A field definition carrying its own validator.
 *
 * The validator lives on the field rather than being recompiled from `kind` and
 * `options` by every consumer: one description, one behaviour, and no drift
 * between what the admin renders and what the writer accepts.
 */
export interface BlockField<K extends BlockFieldKind, V, R extends boolean> {
  readonly kind: K
  /** Kind-specific settings, in the shape `@cogenta/schema` expects. */
  readonly options: Readonly<Record<string, unknown>>
  readonly required: R
  readonly localized: boolean
  readonly admin: FieldAdminOptions | undefined
  /** Validator for the field's value, optionality aside. */
  readonly zod: z.ZodType<V>
}

export type AnyBlockField = BlockField<BlockFieldKind, unknown, boolean>

/** A block's fields, by name. */
export type BlockSchema = Readonly<Record<string, AnyBlockField>>

export interface CommonFieldOptions<R extends boolean = false> {
  readonly required?: R
  readonly localized?: boolean
  readonly admin?: FieldAdminOptions
}

type NotRequired = { readonly required?: false }

/** `required: true` written literally at the call site becomes a literal type. */
type IsRequired<O> = O extends { readonly required: true } ? true : false

/**
 * The one place a runtime boolean is bridged to the literal type derived from
 * the call site. Doing it once here keeps every builder below cast-free.
 */
function makeField<K extends BlockFieldKind, V, R extends boolean>(
  kind: K,
  zod: z.ZodType<V>,
  options: Readonly<Record<string, unknown>>,
  o: CommonFieldOptions<boolean>,
): BlockField<K, V, R> {
  return {
    kind,
    options,
    required: (o.required ?? false) as R,
    localized: o.localized ?? false,
    admin: o.admin,
    zod,
  }
}

export interface TextFieldOptions<R extends boolean = false> extends CommonFieldOptions<R> {
  readonly min?: number
  readonly max?: number
  /**
   * A shape the value must take beyond being text. Only `url` exists so far,
   * because only `embed.url` needs it; the list grows from real needs, not from
   * anticipation.
   */
  readonly format?: 'url'
}

function text<const O extends TextFieldOptions<boolean> = NotRequired>(
  o?: O,
): BlockField<'text', string, IsRequired<O>> {
  const opts: TextFieldOptions<boolean> = o ?? {}
  let schema = plainTextSchema
  if (opts.min !== undefined) schema = schema.min(opts.min)
  if (opts.max !== undefined) schema = schema.max(opts.max)
  if (opts.format === 'url') {
    schema = schema.refine((value) => URL.canParse(value), {
      error: 'must be an absolute URL',
    })
  }
  return makeField('text', schema, { min: opts.min, max: opts.max, format: opts.format }, opts)
}

function richText<const O extends CommonFieldOptions<boolean> = NotRequired>(
  o?: O,
): BlockField<'richText', RichTextDocument, IsRequired<O>> {
  return makeField('richText', richTextDocumentSchema, {}, o ?? {})
}

export interface NumberFieldOptions<R extends boolean = false> extends CommonFieldOptions<R> {
  readonly min?: number
  readonly max?: number
  readonly integer?: boolean
}

function number<const O extends NumberFieldOptions<boolean> = NotRequired>(
  o?: O,
): BlockField<'number', number, IsRequired<O>> {
  const opts: NumberFieldOptions<boolean> = o ?? {}
  let schema = z.number()
  if (opts.integer === true) schema = schema.int()
  if (opts.min !== undefined) schema = schema.min(opts.min)
  if (opts.max !== undefined) schema = schema.max(opts.max)
  return makeField(
    'number',
    schema,
    { min: opts.min, max: opts.max, integer: opts.integer ?? false },
    opts,
  )
}

function boolean<const O extends CommonFieldOptions<boolean> = NotRequired>(
  o?: O,
): BlockField<'boolean', boolean, IsRequired<O>> {
  return makeField('boolean', z.boolean(), {}, o ?? {})
}

export type MediaKind = 'image' | 'video' | 'audio' | 'file'

export interface MediaFieldOptions<R extends boolean = false> extends CommonFieldOptions<R> {
  readonly accept?: readonly MediaKind[]
}

/**
 * A media field stores the media library's identifier, never an URL and never a
 * rendition. Alt text, dimensions and variants belong to the media entry, so
 * they are corrected in one place and every block pointing at it follows.
 */
function media<const O extends MediaFieldOptions<boolean> = NotRequired>(
  o?: O,
): BlockField<'media', string, IsRequired<O>> {
  const opts: MediaFieldOptions<boolean> = o ?? {}
  return makeField('media', z.string().min(1), { accept: opts.accept }, opts)
}

export interface RelationFieldOptions<R extends boolean = false> extends CommonFieldOptions<R> {
  readonly to: string
  readonly many?: boolean
}

type RelationValue<O> = O extends { readonly many: true } ? string[] : string

function relation<const O extends RelationFieldOptions<boolean>>(
  o: O,
): BlockField<'relation', RelationValue<O>, IsRequired<O>> {
  const id = z.string().min(1)
  const schema = (o.many === true ? z.array(id) : id) as unknown as z.ZodType<RelationValue<O>>
  return makeField('relation', schema, { to: o.to, many: o.many ?? false }, o)
}

export interface SelectFieldOptions<R extends boolean = false> extends CommonFieldOptions<R> {
  readonly options: readonly [string, ...string[]]
}

function select<const O extends SelectFieldOptions<boolean>>(
  o: O,
): BlockField<'select', O['options'][number], IsRequired<O>> {
  const schema = z.enum([...o.options]) as z.ZodType<O['options'][number]>
  return makeField('select', schema, { options: o.options }, o)
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export interface ColorFieldOptions<R extends boolean = false> extends CommonFieldOptions<R> {
  /** Restrict the field to named skin tokens rather than free hex values. */
  readonly tokens?: readonly [string, ...string[]]
}

/**
 * Available because contract B lists it, and used by none of the twelve blocks
 * on purpose: a colour picked per block is a presentation value, and rule R3
 * keeps those in the theme's skin tokens. A block-level colour only earns its
 * place when it carries meaning the theme cannot know — the brand colour of an
 * imported partner logo, say — and `tokens` is then the safer form.
 */
function color<const O extends ColorFieldOptions<boolean> = NotRequired>(
  o?: O,
): BlockField<'color', string, IsRequired<O>> {
  const opts: ColorFieldOptions<boolean> = o ?? {}
  const tokens = opts.tokens
  const schema: z.ZodType<string> =
    tokens === undefined
      ? z.string().regex(HEX_COLOR, { error: 'must be a hex colour such as #1a2b3c' })
      : z.enum([...tokens])
  return makeField('color', schema, { tokens }, opts)
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)

/**
 * The shape a `json` or `list` field holds is passed positionally, not inside
 * the options object. Inside it, the contextual type of a block schema widens
 * `required: true` back to `boolean`, and every list would end up optional.
 */
function json<V = JsonValue, const O extends CommonFieldOptions<boolean> = NotRequired>(
  of?: z.ZodType<V>,
  o?: O,
): BlockField<'json', V, IsRequired<O>> {
  const schema = (of ?? jsonValueSchema) as z.ZodType<V>
  return makeField('json', schema, {}, o ?? {})
}

export interface ListFieldOptions<R extends boolean = false> extends CommonFieldOptions<R> {
  readonly min?: number
  readonly max?: number
}

/**
 * A repeated, structured field — the `items[]` of the vocabulary.
 *
 * Contract A has no `array` kind, so a list is stored as a `json` field with an
 * explicit item schema. That keeps a block schema inside the nine allowed kinds
 * while still refusing an item with a missing or unknown key, which a bare
 * `json` field would wave through.
 */
function list<T, const O extends ListFieldOptions<boolean> = NotRequired>(
  of: z.ZodType<T>,
  o?: O,
): BlockField<'json', T[], IsRequired<O>> {
  const opts: ListFieldOptions<boolean> = o ?? {}
  let schema = z.array(of)
  if (opts.min !== undefined) schema = schema.min(opts.min)
  if (opts.max !== undefined) schema = schema.max(opts.max)
  return makeField('json', schema, { list: true, min: opts.min, max: opts.max }, opts)
}

export const f = {
  text,
  richText,
  number,
  boolean,
  media,
  relation,
  select,
  color,
  json,
  list,
} as const

/** The value a field holds once parsed. */
export type FieldValue<F> = F extends BlockField<BlockFieldKind, infer V, boolean> ? V : never

type RequiredFieldNames<S extends BlockSchema> = {
  [K in keyof S]: S[K]['required'] extends true ? K : never
}[keyof S]

type Simplify<T> = { [K in keyof T]: T[K] } & {}

/** The data a block of schema `S` holds, required and optional keys apart. */
export type BlockData<S extends BlockSchema> = Simplify<
  { [K in RequiredFieldNames<S>]: FieldValue<S[K]> } & {
    [K in Exclude<keyof S, RequiredFieldNames<S>>]?: FieldValue<S[K]>
  }
>
