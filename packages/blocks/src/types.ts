import type { z } from 'zod'
import type { BlockData, BlockSchema } from './field.js'
import type { BlockVariant } from './variant.js'

/**
 * Contract B, "Manifeste de bloc", frozen at `blocks@1.0` on 2026-08-13.
 */

/** Feeds the refusal to build statically. `server` and `edge` need a request. */
export const BLOCK_RUNTIMES = ['static', 'server', 'edge'] as const

export type BlockRuntime = (typeof BLOCK_RUNTIMES)[number]

/**
 * `'none'` is not in the contract's example; it is the honest answer for the
 * blocks that carry no heading at all — `prose`, `gallery`, `quote`, `embed`.
 * Leaving `headingLevel` merely absent would let a theme invent one and break
 * the document outline.
 */
export const HEADING_LEVELS = ['none', 'h1', 'h2', 'h3', 'h4'] as const

export type HeadingLevel = (typeof HEADING_LEVELS)[number]

export interface BlockA11y {
  /** The level the block's own title is rendered at, if it has one. */
  readonly headingLevel: HeadingLevel
}

export interface BlockIdentity<N extends string = string> {
  /**
   * Stable for as long as the block exists. It survives a reorder, a
   * translation and a version restore — which is what makes commenting on one
   * block, diffing two versions readably, and reindexing only the blocks that
   * actually changed possible.
   */
  readonly _key: string
  /** The block's name in the vocabulary. Discriminates a mixed block list. */
  readonly _type: N
  /**
   * The schema version the stored data conforms to.
   *
   * Not spelled out in the contract, and unavoidable: "a block whose schema
   * version has moved is migrated on load" needs to know where the data starts
   * from. Without it, a migration is a guess.
   */
  readonly _version: string
  /**
   * Optional per-instance visual variant (`blocks@2.0`, RFC 0002). Part of
   * the envelope every block carries — not a field a block's own `schema`
   * declares — so it applies uniformly to all seventeen without any of them
   * having to opt in. Absent on all content written before this contract
   * version, and rendered byte-for-byte as before: purely additive.
   */
  readonly variant?: BlockVariant
}

/** A block as it is stored inside a content entry. */
export type PlacedBlock<
  N extends string = string,
  S extends BlockSchema = BlockSchema,
> = BlockIdentity<N> & BlockData<S>

/** A block of unknown type, as read from storage before it is dispatched. */
export interface UnknownPlacedBlock extends BlockIdentity {
  readonly [field: string]: unknown
}

export interface BlockManifest<N extends string, S extends BlockSchema> {
  readonly name: N
  /** Semver. Changing a block's schema is a major bump (contract B). */
  readonly version: string
  readonly schema: S
  readonly runtime: BlockRuntime
  /**
   * The vocabulary block to fall back on when the active theme does not
   * implement this one. `null` for the twelve, required for anything a theme
   * ships of its own — that requirement is what prevents lock-in.
   */
  readonly fallback: string | null
  readonly a11y: BlockA11y
}

export interface BlockDefinition<N extends string = string, S extends BlockSchema = BlockSchema>
  extends BlockManifest<N, S> {
  /** Validator for a whole placed block, envelope included. */
  readonly validator: z.ZodType<PlacedBlock<N, S>>
}

/**
 * A definition whose name and schema are not known to the caller — what a
 * registry holds. The validator's output is erased to `unknown` on purpose:
 * every concrete definition is assignable to it, which a precise-but-generic
 * output type would not be.
 */
export interface AnyBlockDefinition extends BlockManifest<string, BlockSchema> {
  readonly validator: z.ZodType<unknown>
}

/** The stored shape of the blocks a definition describes. */
export type BlockValue<D> = D extends BlockDefinition<infer N, infer S> ? PlacedBlock<N, S> : never
