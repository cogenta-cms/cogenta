import { type CogentaError, isCogentaError } from '@cogenta/core'
import { z } from 'zod'
import { invalidBlock } from './errors.js'
import type { BlockSchema } from './field.js'
import { type BlockRegistry, vocabularyRegistry } from './registry.js'
import type {
  AnyBlockDefinition,
  BlockDefinition,
  PlacedBlock,
  UnknownPlacedBlock,
} from './types.js'

/**
 * Validation at write time (spec L1, "Blocs").
 *
 * A block is checked before it is stored, never on the way out. Bad data that
 * reaches the database has already been copied into a version, a translation
 * and a search index by the time a renderer notices.
 */

/** Just enough to know whose rules to apply, and which block to name in an error. */
const envelopeSchema = z.object({
  _key: z.string().min(1),
  _type: z.string().min(1),
  _version: z.string().min(1),
})

function readType(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const type = (input as { _type?: unknown })._type
  return typeof type === 'string' ? type : undefined
}

function readKey(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const key = (input as { _key?: unknown })._key
  return typeof key === 'string' ? key : undefined
}

/** Runs one definition's validator, or throws an error naming block and field. */
function check(definition: AnyBlockDefinition, input: unknown): unknown {
  const result = definition.validator.safeParse(input)
  if (!result.success) throw invalidBlock(definition.name, readKey(input), result.error)
  return result.data
}

/**
 * Validates against one known definition, keeping the block's precise type.
 *
 * The assertion is the counterpart of the one in `defineBlock`: the validator
 * was built from `definition.schema`, so what it returns is exactly the data
 * that schema describes — a fact the compiler cannot re-derive here.
 */
export function parseBlockWith<N extends string, S extends BlockSchema>(
  definition: BlockDefinition<N, S>,
  input: unknown,
): PlacedBlock<N, S> {
  return check(definition, input) as PlacedBlock<N, S>
}

/** Stamps the envelope on freshly authored data, so `_version` is never guessed. */
export function createBlock<N extends string, S extends BlockSchema>(
  definition: BlockDefinition<N, S>,
  key: string,
  data: Record<string, unknown>,
): PlacedBlock<N, S> {
  return parseBlockWith(definition, {
    ...data,
    _key: key,
    _type: definition.name,
    _version: definition.version,
  })
}

/**
 * Validates one block, looking its definition up by `_type`.
 *
 * Throws a `CogentaError` naming the block and the offending field. An unknown
 * `_type` is a `BLOCK_UNKNOWN`, not a validation failure: the fix is to
 * register the block, not to edit the content.
 */
export function parseBlock(
  input: unknown,
  registry: BlockRegistry = vocabularyRegistry,
): UnknownPlacedBlock {
  const envelope = envelopeSchema.safeParse(input)
  if (!envelope.success) {
    throw invalidBlock(readType(input) ?? '(unnamed)', readKey(input), envelope.error)
  }
  const definition = registry.mustGet(envelope.data._type)
  return check(definition, input) as UnknownPlacedBlock
}

export type BlockParseOutcome =
  | { readonly ok: true; readonly block: UnknownPlacedBlock }
  | { readonly ok: false; readonly error: CogentaError }

/** For an admin that would rather show the problem than crash on it. */
export function safeParseBlock(
  input: unknown,
  registry: BlockRegistry = vocabularyRegistry,
): BlockParseOutcome {
  try {
    return { ok: true, block: parseBlock(input, registry) }
  } catch (error) {
    // Only CogentaError is thrown above; anything else is a bug worth surfacing.
    if (isCogentaError(error)) return { ok: false, error }
    throw error
  }
}

/**
 * Validates a whole block zone, and refuses duplicate `_key`s.
 *
 * A repeated key is not cosmetic: comments, diffs and the RAG index are all
 * addressed by key, so two blocks sharing one silently merge in every one of
 * those views.
 */
export function parseBlocks(
  inputs: readonly unknown[],
  registry: BlockRegistry = vocabularyRegistry,
): UnknownPlacedBlock[] {
  const blocks = inputs.map((input) => parseBlock(input, registry))
  const seen = new Set<string>()
  for (const block of blocks) {
    if (seen.has(block._key)) {
      throw invalidBlock(
        block._type,
        block._key,
        new z.ZodError([
          {
            code: 'custom',
            path: ['_key'],
            message: `duplicate block key "${block._key}" in the same zone`,
            input: block._key,
          },
        ]),
      )
    }
    seen.add(block._key)
  }
  return blocks
}
