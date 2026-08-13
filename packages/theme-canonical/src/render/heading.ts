import type { HeadingLevel } from '@cogenta/blocks'
import { VOCABULARY } from '@cogenta/blocks'
import { type Child, type HtmlElement, h } from './html.js'

/**
 * The heading level of a block is **not** a theme decision: contract B fixes it
 * in each block's `a11y.headingLevel`, and the theme reads it from there rather
 * than restating it. Restating it is how an outline drifts — one block gets
 * promoted in the theme, the page grows a second `h1`, and nothing fails.
 */
const DECLARED_LEVELS: ReadonlyMap<string, HeadingLevel> = new Map(
  VOCABULARY.map((block) => [block.name, block.a11y.headingLevel]),
)

export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

/** The level a block's own title is rendered at, or `null` if it carries none. */
export function blockHeadingTag(blockName: string): HeadingTag | null {
  const level = DECLARED_LEVELS.get(blockName)
  if (level === undefined || level === 'none') return null
  return level
}

/**
 * The level for a title *inside* a block — a feature's name, a listed entry.
 *
 * One below the block's own heading when the block renders one, and at the
 * block's declared level when it does not: a `featureGrid` without a title must
 * not start its items at `h3`, which would skip a level.
 */
export function nestedHeadingTag(blockName: string, blockRendersHeading: boolean): HeadingTag {
  const own = blockHeadingTag(blockName) ?? 'h2'
  if (!blockRendersHeading) return own
  const next = Number(own.slice(1)) + 1
  return `h${Math.min(next, 6)}` as HeadingTag
}

export function heading(
  tag: HeadingTag,
  attrs: Readonly<Record<string, string | number | boolean | undefined>>,
  ...children: readonly Child[]
): HtmlElement {
  return h(tag, attrs, ...children)
}
