import { z } from 'zod'
import { invalidBlockDefinition } from './errors.js'
import { BLOCK_FIELD_KINDS, type BlockSchema } from './field.js'
import {
  BLOCK_RUNTIMES,
  type BlockDefinition,
  type BlockManifest,
  HEADING_LEVELS,
  type PlacedBlock,
} from './types.js'
import { isBlockVersion } from './version.js'

/** Reserved by the envelope. A field may not shadow one. */
const RESERVED_FIELDS = new Set(['_key', '_type', '_version'])

/** Matches the vocabulary's own names: `hero`, `mediaFigure`, `collectionList`. */
const BLOCK_NAME = /^[a-z][a-zA-Z0-9]*$/

/**
 * Declares a block: its identity, its data, and what a renderer needs to know
 * about it before rendering anything.
 *
 * The manifest is checked here rather than at first use, because a malformed
 * block definition is a programming error that must surface at import time —
 * not on the one page in a thousand that happens to use the block.
 */
export function defineBlock<const N extends string, const S extends BlockSchema>(
  manifest: BlockManifest<N, S>,
): BlockDefinition<N, S> {
  const { name, version, schema, runtime, fallback, a11y } = manifest

  if (!BLOCK_NAME.test(name)) {
    throw invalidBlockDefinition(name, 'the name must be camelCase, starting with a letter')
  }
  if (!isBlockVersion(version)) {
    throw invalidBlockDefinition(name, `"${version}" is not a major.minor.patch version`)
  }
  if (!BLOCK_RUNTIMES.includes(runtime)) {
    throw invalidBlockDefinition(name, `runtime must be one of ${BLOCK_RUNTIMES.join(', ')}`)
  }
  if (!HEADING_LEVELS.includes(a11y.headingLevel)) {
    throw invalidBlockDefinition(
      name,
      `a11y.headingLevel must be one of ${HEADING_LEVELS.join(', ')}`,
    )
  }
  if (fallback !== null && (fallback === name || !BLOCK_NAME.test(fallback))) {
    throw invalidBlockDefinition(name, 'fallback must be null or the name of another block')
  }

  const shape: Record<string, z.ZodType> = {
    _key: z.string().min(1),
    _type: z.literal(name),
    _version: z.string().refine(isBlockVersion, { error: 'must be a major.minor.patch version' }),
  }

  for (const [field, definition] of Object.entries(schema)) {
    if (RESERVED_FIELDS.has(field)) {
      throw invalidBlockDefinition(name, `"${field}" is reserved by the block envelope`)
    }
    if (!BLOCK_FIELD_KINDS.includes(definition.kind)) {
      throw invalidBlockDefinition(
        name,
        `field "${field}" uses "${definition.kind}", which contract B does not allow inside a block`,
      )
    }
    shape[field] = definition.required ? definition.zod : definition.zod.optional()
  }

  // Strict on purpose, and this is where rule R3 is enforced structurally: a
  // `className`, a `style` or an `html` key is not ignored, it is refused. An
  // ignored key would be silently dropped on the next write instead.
  //
  // The cast bridges the shape assembled at runtime and the type derived from
  // the schema at compile time; both describe the same object, and only the
  // compiler cannot see it.
  const validator = z.strictObject(shape) as unknown as z.ZodType<PlacedBlock<N, S>>

  return { name, version, schema, runtime, fallback, a11y, validator }
}
