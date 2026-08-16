import type { BaseFieldOptions, FieldDefinition, FieldKind, OnDelete } from './types.js'

/**
 * The field constructors of contract A § "Types de champ (v1)".
 *
 * Every constructor returns a plain, serialisable `FieldDefinition`: the schema
 * is data, not behaviour, because three consumers read it — the validator, the
 * type generator and the admin — and a closure would only be usable by the
 * first one.
 *
 * Kind-specific defaults are materialised here rather than at each call site,
 * so `onDelete` reads `'restrict'` in `.cogenta/schema.json` even when the
 * author never typed it.
 */

const BASE_KEYS = ['required', 'default', 'localized', 'unique', 'validate', 'admin'] as const

/**
 * Copies only the base options that were actually provided.
 *
 * `exactOptionalPropertyTypes` is on: writing `required: input.required` would
 * store an explicit `undefined`, which is not the same as an absent key — and
 * it would show up in the generated JSON.
 */
function baseOf(input: BaseFieldOptions): BaseFieldOptions {
  const base: Record<string, unknown> = {}
  for (const key of BASE_KEYS) {
    const value = input[key]
    if (value !== undefined) base[key] = value
  }
  return base as BaseFieldOptions
}

function field<TKind extends FieldKind, TOptions extends Readonly<Record<string, unknown>>>(
  kind: TKind,
  input: BaseFieldOptions,
  options: TOptions,
): FieldDefinition & { readonly kind: TKind; readonly options: TOptions } {
  return { kind, ...baseOf(input), options }
}

export interface TextFieldOptions extends BaseFieldOptions {
  readonly min?: number
  readonly max?: number
  /** Hint for the admin: render a textarea rather than a single-line input. */
  readonly multiline?: boolean
}

export interface SlugFieldOptions extends BaseFieldOptions {
  /** Field the admin derives the slug from when the editor has not typed one. */
  readonly from?: string
  readonly max?: number
}

export interface NumberFieldOptions extends BaseFieldOptions {
  readonly min?: number
  readonly max?: number
  readonly integer?: boolean
}

export const MEDIA_ACCEPT_KINDS = ['image', 'video', 'audio', 'file'] as const

export type MediaAcceptKind = (typeof MEDIA_ACCEPT_KINDS)[number]

export interface MediaFieldOptions extends BaseFieldOptions {
  readonly accept?: readonly MediaAcceptKind[]
  readonly many?: boolean
}

export interface RelationFieldOptions extends BaseFieldOptions {
  /** Name of the target collection. */
  readonly to: string
  readonly many?: boolean
  readonly onDelete?: OnDelete
}

/** A choice is a value plus what the editor reads. Bare strings are widened. */
export interface SelectChoice {
  readonly value: string
  readonly label?: string
}

export interface SelectFieldOptions extends BaseFieldOptions {
  readonly options: readonly (string | SelectChoice)[]
  readonly many?: boolean
}

export interface TaxonomyFieldOptions extends BaseFieldOptions {
  /** Name of the taxonomy declared with `defineTaxonomy()`. */
  readonly of: string
  readonly many?: boolean
}

export interface BlocksFieldOptions extends BaseFieldOptions {
  /** `'*'` allows the whole vocabulary; a list restricts it. */
  readonly allow?: '*' | readonly string[]
}

type Plain = Readonly<Record<string, unknown>>

/** Drops the base keys so they are not duplicated inside `options`. */
function specificOf<T extends object>(input: T, keys: readonly (keyof T & string)[]): Plain {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const value = input[key]
    if (value !== undefined) out[key] = value
  }
  return out
}

function normaliseChoices(options: readonly (string | SelectChoice)[]): readonly SelectChoice[] {
  return options.map((choice) => (typeof choice === 'string' ? { value: choice } : choice))
}

export const f = {
  text(options: TextFieldOptions = {}) {
    return field('text', options, specificOf(options, ['min', 'max', 'multiline']))
  },

  richText(options: BaseFieldOptions = {}) {
    return field('richText', options, {})
  },

  slug(options: SlugFieldOptions = {}) {
    return field('slug', options, specificOf(options, ['from', 'max']))
  },

  number(options: NumberFieldOptions = {}) {
    return field('number', options, specificOf(options, ['min', 'max', 'integer']))
  },

  boolean(options: BaseFieldOptions = {}) {
    return field('boolean', options, {})
  },

  /** Calendar day, no time zone: `YYYY-MM-DD`. */
  date(options: BaseFieldOptions = {}) {
    return field('date', options, {})
  },

  /** Instant, stored as ISO 8601 with an offset. */
  datetime(options: BaseFieldOptions = {}) {
    return field('datetime', options, {})
  },

  media(options: MediaFieldOptions = {}) {
    return field('media', options, {
      accept: options.accept ?? MEDIA_ACCEPT_KINDS,
      many: options.many ?? false,
    })
  },

  relation(options: RelationFieldOptions) {
    // `'restrict'` by default, deliberately (contract A § "Relations"):
    // deleting an author must not silently erase their articles.
    return field('relation', options, {
      to: options.to,
      many: options.many ?? false,
      onDelete: options.onDelete ?? ('restrict' satisfies OnDelete),
    })
  },

  select(options: SelectFieldOptions) {
    return field('select', options, {
      options: normaliseChoices(options.options),
      many: options.many ?? false,
    })
  },

  json(options: BaseFieldOptions = {}) {
    return field('json', options, {})
  },

  /** A point on the globe: `{ lat, lng }`, degrees, WGS 84. */
  geo(options: BaseFieldOptions = {}) {
    return field('geo', options, {})
  },

  /** Hex notation, `#rgb`, `#rrggbb` or `#rrggbbaa`. */
  color(options: BaseFieldOptions = {}) {
    return field('color', options, {})
  },

  /**
   * Terms of a declared taxonomy (`schema@2.0`, ADR-0022).
   *
   * `many: true` by default, unlike `relation`: the reason taxonomies exist at
   * all is that the same term is reused across collections and an entry
   * usually carries several. A single-valued taxonomy is the exception, and
   * says so.
   */
  taxonomy(options: TaxonomyFieldOptions) {
    return field('taxonomy', options, {
      of: options.of,
      many: options.many ?? true,
    })
  },

  blocks(options: BlocksFieldOptions = {}) {
    return field('blocks', options, { allow: options.allow ?? '*' })
  },
} as const
