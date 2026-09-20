import { CogentaError } from '@cogenta/core'
import { newId as uuidv7 } from '../id.js'
import type { CollectionDefinition, FieldDefinition } from '../types.js'
import { fieldSchema } from '../validation.js'
import { pruneEmptyBlockData } from './block-data.js'
import type { BlockZones, ContentBlock, ContentValues } from './types.js'

/**
 * Turning declared values into column values and back.
 *
 * The whole point is that a caller never learns which database it is talking
 * to: a `richText` document goes in as an array and comes back as an array on
 * all four servers, even though one of them stores it as text it would happily
 * have parsed for us and another would not.
 */

const JSON_KINDS = new Set(['richText', 'json', 'geo'])

/**
 * `media`/`select` with `many: true`: several values, but — unlike a to-many
 * `relation` or `taxonomy` field — nothing on the other end that a foreign
 * key could point at (a media asset lives in its own subsystem, a select
 * choice references nothing at all). So the ordered array is JSON-encoded
 * straight into its own column, the same trick `richText`/`json`/`geo`
 * already use, rather than a join table `relationsOf` has no reason to build
 * for either kind.
 */
function isJsonEncodedArray(definition: FieldDefinition): boolean {
  return (
    (definition.kind === 'media' || definition.kind === 'select') &&
    definition.options['many'] === true
  )
}

function invalid(message: string, hint: string, details: Record<string, unknown>): CogentaError {
  return new CogentaError({ code: 'CONTENT_INVALID', message, hint, details })
}

/**
 * The declared schema, applied where the values actually land.
 *
 * `validation.ts`'s header has said since L1 that it builds "the validator
 * that guards every write". Nothing called it on the way in: this function
 * checked a few types by hand and let everything else through. Measured on a
 * real server, that meant a `text` field declaring `max: 60` stored 250
 * characters, a `slug` stored `"Not A Slug!!"`, a `boolean` stored the string
 * `"yes"` (coerced to `true`, so `"false"` would have been `true` too), and a
 * `richText` column took a plain string — while a reader downstream was
 * entitled to assume every one of those was impossible.
 *
 * Parsing rather than merely checking: a schema's defaults only fill in when
 * something parses, which is how a Portable Text span that legitimately omits
 * `marks` reaches the column with `marks: []` instead of crashing the first
 * reader that counts them.
 *
 * `date` and `datetime` are the documented exception, below: they accept a
 * `Date` object and an empty string, and neither is a shape the declared
 * schema describes.
 */
/**
 * What a reference field held to before this file learned to validate: an
 * array when the field is many-valued, a string otherwise. Unchanged, so that
 * tightening it stays a decision rather than a side effect.
 */
function referenceShape(field: string, definition: FieldDefinition, value: unknown): unknown {
  if (definition.options['many'] === true) {
    if (!Array.isArray(value)) {
      throw invalid(
        `"${field}" holds several values, so it expects an array.`,
        'Pass an array of ids.',
        { field, kind: definition.kind },
      )
    }
    return value
  }
  if (typeof value !== 'string') {
    throw invalid(
      `"${field}" expects a string, not ${typeof value}.`,
      'A to-one media, relation or taxonomy field holds one id.',
      { field, kind: definition.kind },
    )
  }
  return value
}

/**
 * Reference kinds are left to their own check below, on purpose and for now.
 * The declared schema demands a UUID of them (`idSchema`, citing ADR-0015),
 * which is very likely right — every id this codebase mints is one — but a
 * media asset belongs to a subsystem that `columns.ts` deliberately keeps at
 * arm's length ("no foreign key: the media library is its own subsystem"), and
 * turning a reference's *shape* into a write-time refusal is a decision of its
 * own, not a side effect of closing the gap this function was fixing. Written
 * down rather than silently skipped, so that decision can be taken on purpose.
 */
const UNCHECKED_REFERENCE_KINDS = new Set(['media', 'relation', 'taxonomy'])

function validated(field: string, definition: FieldDefinition, value: unknown): unknown {
  if (UNCHECKED_REFERENCE_KINDS.has(definition.kind))
    return referenceShape(field, definition, value)

  const parsed = fieldSchema(definition).safeParse(value)
  if (parsed.success) return parsed.data

  throw invalid(
    `"${field}" is not a valid ${definition.kind} value.`,
    'Check what the collection declares for this field — a length, a pattern, a set of choices.',
    {
      field,
      kind: definition.kind,
      // Paths and reasons only. The value itself is content, and content never
      // belongs in an error's details.
      issues: parsed.error.issues.slice(0, 5).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
  )
}

export function encodeFieldValue(
  field: string,
  definition: FieldDefinition,
  value: unknown,
): unknown {
  if (value === undefined || value === null) return null

  if (definition.kind === 'date' || definition.kind === 'datetime') {
    // An empty string is "no date", never a date. It is what a cleared date
    // input sends (`DateField`'s own value when a person empties it), and it
    // used to be refused with a 422 — so clearing a date was impossible from
    // the admin. It also had to stop being storable: `schema@2.4` orders by
    // this column and treats an absent value as "last", while `''` would sort
    // *first* and make a cursor skip rows (found by `db-dialect-specialist`).
    if (typeof value === 'string' && value.trim() === '') return null
    // Stored as an ISO-8601 string in UTC on every dialect: see `columns.ts`.
    const date = value instanceof Date ? value : new Date(String(value))
    if (Number.isNaN(date.getTime())) {
      throw invalid(`"${field}" is not a usable date.`, 'Pass a Date or an ISO-8601 string.', {
        field,
      })
    }
    return definition.kind === 'date' ? date.toISOString().slice(0, 10) : date.toISOString()
  }

  const checked = validated(field, definition, value)

  // Everything else is already the column's own shape: a string, a number, a
  // boolean. Only the JSON-backed kinds still need encoding.
  if (isJsonEncodedArray(definition) || JSON_KINDS.has(definition.kind)) {
    return JSON.stringify(checked)
  }
  return checked
}

export function decodeFieldValue(definition: FieldDefinition, raw: unknown): unknown {
  if (raw === undefined || raw === null) return null

  if (JSON_KINDS.has(definition.kind) || isJsonEncodedArray(definition)) {
    if (typeof raw !== 'string') return raw
    try {
      return JSON.parse(raw)
    } catch {
      // Never throw while reading: a document stored by an older version, or by
      // hand, must still be recoverable through the admin.
      return null
    }
  }

  // MySQL returns 0/1, Postgres a real boolean, SQLite an integer.
  if (definition.kind === 'boolean') return Boolean(Number(raw))
  if (definition.kind === 'number') return Number(raw)

  return typeof raw === 'string' ? raw : String(raw)
}

export interface NormalisedValues {
  /** Column-backed fields, already encoded for the driver. */
  readonly columns: Record<string, unknown>
  /** To-many relations: field name to the ordered list of target ids. */
  readonly relations: Record<string, readonly string[]>
  /** The decoded values, as the caller will read them back. */
  readonly values: Record<string, unknown>
}

export interface NormaliseOptions {
  /** A partial update only looks at the keys it was given. */
  readonly partial: boolean
  /**
   * Whether a missing `required` field is an error.
   *
   * False while writing a draft — a piece being written is incomplete by
   * definition, and refusing to save it loses work. True at publication, which
   * is the moment the rule actually means something.
   */
  readonly enforceRequired: boolean
}

/**
 * Validates an input against the collection and splits it into what goes where.
 *
 * `required` is checked here rather than by the column, so that a draft can be
 * saved half-written and only publication has to be complete.
 */
export function normaliseValues(
  collection: CollectionDefinition,
  input: ContentValues,
  options: NormaliseOptions,
): NormalisedValues {
  const columns: Record<string, unknown> = {}
  const relations: Record<string, readonly string[]> = {}
  const values: Record<string, unknown> = {}

  for (const key of Object.keys(input)) {
    if (collection.fields[key] === undefined) {
      throw invalid(
        `"${key}" is not a field of the "${collection.name}" collection.`,
        'Check the field name against the schema, or add it and generate a migration.',
        { collection: collection.name, field: key },
      )
    }
  }

  for (const [name, definition] of Object.entries(collection.fields)) {
    if (definition.kind === 'blocks') continue

    const provided = Object.hasOwn(input, name)
    if (!provided && options.partial) continue

    const supplied = provided ? input[name] : definition.default
    // An empty string on a date field is "no date", handled *here* rather than
    // only at encoding time so that a required date cleared to `''` is still
    // refused as missing rather than slipping through as null.
    const raw =
      (definition.kind === 'date' || definition.kind === 'datetime') &&
      typeof supplied === 'string' &&
      supplied.trim() === ''
        ? null
        : supplied
    // A `taxonomy` field is joined exactly like a `relation` (ADR-0022): a
    // to-many one lives in a join table and holds an ordered list of ids.
    const joined = definition.kind === 'relation' || definition.kind === 'taxonomy'
    const many = joined && definition.options['many'] === true

    if (raw === undefined || raw === null) {
      if (definition.required === true && options.enforceRequired) {
        throw invalid(
          `"${name}" is required on "${collection.name}".`,
          'Give the field a value, or make it optional in the schema.',
          { collection: collection.name, field: name },
        )
      }
      if (many) {
        relations[name] = []
        values[name] = []
      } else if (isJsonEncodedArray(definition)) {
        // Same rule as a joined to-many field's empty case (ADR-0022): `[]`,
        // never `null` — a `media`/`select` field with `many: true` has no
        // join table to be absent from, but it is still "several values",
        // and "zero of them" is not the same state as "unset".
        columns[name] = encodeFieldValue(name, definition, [])
        values[name] = []
      } else {
        columns[name] = null
        values[name] = null
      }
      continue
    }

    if (definition.validate !== undefined) {
      const verdict = definition.validate(raw)
      if (verdict !== true) {
        throw invalid(`"${name}" is not valid: ${verdict}`, 'Correct the value and try again.', {
          collection: collection.name,
          field: name,
        })
      }
    }

    if (many) {
      if (!Array.isArray(raw)) {
        throw invalid(
          `"${name}" is a to-many relation, so it expects an array of ids.`,
          'Pass the ids of the related entries, in the order they should appear.',
          { collection: collection.name, field: name },
        )
      }
      const ids = raw.map((item) => {
        if (typeof item !== 'string') {
          throw invalid(
            `"${name}" expects entry ids, and one of them is not a string.`,
            'A relation holds identifiers, never whole entries.',
            { collection: collection.name, field: name },
          )
        }
        return item
      })
      // Duplicates would break the join table's primary key, and mean nothing.
      relations[name] = [...new Set(ids)]
      values[name] = relations[name]
      continue
    }

    columns[name] = encodeFieldValue(name, definition, raw)
    values[name] = decodeFieldValue(definition, columns[name])
  }

  return { columns, relations, values }
}

/**
 * Checks a block zone and gives every block a `_key`.
 *
 * A key supplied by the caller is kept, always: it is what ties a block to its
 * previous self across a diff, a comment and a RAG chunk. One is only minted for
 * a block that has never been stored.
 */
export function normaliseBlocks(
  collection: CollectionDefinition,
  zones: BlockZones,
  newKey: () => string = uuidv7,
): Record<string, readonly ContentBlock[]> {
  const normalised: Record<string, readonly ContentBlock[]> = {}

  for (const [zone, blocks] of Object.entries(zones)) {
    const definition = collection.fields[zone]
    if (definition === undefined || definition.kind !== 'blocks') {
      throw invalid(
        `"${zone}" is not a block zone of "${collection.name}".`,
        'A block zone is a field declared with f.blocks().',
        { collection: collection.name, field: zone },
      )
    }

    const seen = new Set<string>()
    normalised[zone] = blocks.map((block) => {
      if (typeof block.type !== 'string' || block.type.length === 0) {
        throw invalid(
          `A block in "${zone}" has no type.`,
          'Every block declares which block of the vocabulary it is.',
          { collection: collection.name, field: zone },
        )
      }

      const key = block.key !== undefined && block.key !== '' ? block.key : newKey()
      if (seen.has(key)) {
        throw invalid(
          `Two blocks in "${zone}" share the key "${key}".`,
          'A block key is unique inside its zone: it is how a block is followed across versions.',
          { collection: collection.name, field: zone, key },
        )
      }
      seen.add(key)

      return { key, type: block.type, data: pruneEmptyBlockData(block.data ?? {}) }
    })
  }

  return normalised
}
