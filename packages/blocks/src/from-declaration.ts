import { z } from 'zod'
import { invalidBlockDefinition } from './errors.js'
import { type AnyBlockField, BLOCK_FIELD_KINDS, type BlockSchema, f } from './field.js'

/**
 * A block schema written as **data** rather than as calls to `f.*`.
 *
 * This exists because a block can now come from somewhere that may not run
 * code in this process: a plugin declares its blocks in
 * `plugin.manifest.json`, read and never executed (the hole L31's security
 * review closed). The declaration is validated where it arrives, and turned
 * into a real schema here, by the same constructors every vocabulary block is
 * built from — so a declared block is a first-class block, with the same
 * validator, the same envelope and the same fallback chain, not a second
 * class of thing the rest of the code has to know about.
 *
 * Deliberately structural: nothing here knows what a plugin is, and
 * `@cogenta/blocks` gains no dependency on one.
 */

/** The kinds a declaration may use: contract B's own, plus `list` for a repeating group. */
export const DECLARABLE_FIELD_KINDS = [...BLOCK_FIELD_KINDS, 'list'] as const

export type DeclarableFieldKind = (typeof DECLARABLE_FIELD_KINDS)[number]

export interface DeclaredBlockField {
  readonly kind: string
  readonly required?: boolean
  readonly localized?: boolean
  readonly label?: string
  readonly help?: string
  readonly options?: Readonly<Record<string, unknown>>
  /** For `list` only: the fields one item holds. */
  readonly of?: Readonly<Record<string, DeclaredBlockField>>
}

export type DeclaredBlockSchema = Readonly<Record<string, DeclaredBlockField>>

function refuse(path: string, message: string): never {
  throw invalidBlockDefinition(path, message)
}

function common(declaration: DeclaredBlockField): Record<string, unknown> {
  return {
    ...(declaration.required === true ? { required: true } : {}),
    ...(declaration.localized === true ? { localized: true } : {}),
    ...(declaration.label === undefined && declaration.help === undefined
      ? {}
      : {
          admin: {
            ...(declaration.label === undefined ? {} : { label: declaration.label }),
            ...(declaration.help === undefined ? {} : { help: declaration.help }),
          },
        }),
  }
}

/** One declared field, as the real field a block schema holds. */
export function blockFieldFromDeclaration(
  declaration: DeclaredBlockField,
  path: string,
): AnyBlockField {
  const options = { ...(declaration.options ?? {}), ...common(declaration) } as never

  switch (declaration.kind) {
    case 'text':
      return f.text(options)
    case 'richText':
      return f.richText(options)
    case 'number':
      return f.number(options)
    case 'boolean':
      return f.boolean(options)
    case 'media':
      return f.media(options)
    case 'relation':
      return f.relation(options)
    case 'color':
      return f.color(options)
    case 'json':
      return f.json(options)
    case 'select': {
      const choices = (declaration.options ?? {})['options']
      if (!Array.isArray(choices) || choices.some((choice) => typeof choice !== 'string')) {
        refuse(path, 'a select field must list its options as strings')
      }
      return f.select(options)
    }
    case 'list': {
      const of = declaration.of
      if (of === undefined || Object.keys(of).length === 0) {
        refuse(path, 'a list must say what one of its items holds')
      }
      // Strict, exactly as the vocabulary's own gallery and FAQ items are: an
      // unexpected key in a stored item is a mistake to report, not data to
      // keep and render later.
      const shape: Record<string, z.ZodType> = { _key: z.string().min(1) }
      for (const [name, item] of Object.entries(of)) {
        if (item.kind === 'list') refuse(`${path}.of.${name}`, 'a list cannot hold another list')
        const built = blockFieldFromDeclaration(item, `${path}.of.${name}`)
        shape[name] = item.required === true ? built.zod : built.zod.optional()
      }
      return f.list(z.strictObject(shape), options)
    }
    default:
      return refuse(path, `"${declaration.kind}" is not a field kind a block may declare`)
  }
}

/** A whole declared schema, ready for `defineBlock`. */
export function blockSchemaFromDeclaration(
  fields: DeclaredBlockSchema | undefined,
  path: string,
): BlockSchema {
  const schema: Record<string, AnyBlockField> = {}
  for (const [name, declaration] of Object.entries(fields ?? {})) {
    schema[name] = blockFieldFromDeclaration(declaration, `${path}.${name}`)
  }
  return schema
}

/**
 * A declared field map as one strict object schema.
 *
 * Where `blockSchemaFromDeclaration` builds what `defineBlock` wants, this
 * builds what anything else validating a plain settings object wants — a
 * plugin's widget settings, in L32 step 4. Strict, so a stored setting the
 * declaration never mentioned is refused rather than kept and rendered later.
 */
export function declaredObjectSchema(
  fields: DeclaredBlockSchema | undefined,
  path: string,
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {}
  for (const [name, declaration] of Object.entries(fields ?? {})) {
    const built = blockFieldFromDeclaration(declaration, `${path}.${name}`)
    shape[name] = declaration.required === true ? built.zod : built.zod.optional()
  }
  return z.strictObject(shape) as unknown as z.ZodType<Record<string, unknown>>
}
