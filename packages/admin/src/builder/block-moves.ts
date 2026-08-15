import type { ContentBlock } from '../api/content-client.js'
import { blockDefinition, freshBlockKey } from '../blocks/vocabulary.js'

/**
 * Every layout action the builder can take, as pure functions on the block
 * list (L16 tasks 2 and 3).
 *
 * They live apart from the components for two reasons. They are what undo/redo
 * snapshots, so they must return a new array every time they change anything
 * and the *same* array when they change nothing — `history.push` relies on
 * exactly that to avoid recording empty steps. And they are the only place
 * that decides what a drag or an inline edit is allowed to do to the content,
 * which is worth being able to test without a DOM.
 *
 * None of them ever produces HTML, CSS, a position or a size. A block is a
 * key, a type and semantic data (contract B, rule R3); a builder that stored
 * where a block sits would be storing a layout decision that belongs to the
 * theme.
 */

/** The field kinds a text node in the preview can carry the whole value of. */
const INLINE_EDITABLE_KINDS: ReadonlySet<string> = new Set(['text', 'slug'])

export function indexOfKey(blocks: readonly ContentBlock[], key: string): number {
  return blocks.findIndex((block) => block.key === key)
}

/**
 * Moves the block `key` so that it sits at `to`.
 *
 * Expressed as "put it at this index" rather than "before/after that block",
 * because that is what both entry points already know: the drop target's own
 * position, and the keyboard shortcut's ±1.
 */
export function moveBlock(
  blocks: readonly ContentBlock[],
  key: string,
  to: number,
): readonly ContentBlock[] {
  const from = indexOfKey(blocks, key)
  if (from === -1) return blocks
  const target = Math.max(0, Math.min(to, blocks.length - 1))
  if (target === from) return blocks
  const next = [...blocks]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return blocks
  next.splice(target, 0, moved)
  return next
}

/**
 * Inserts a new block of `type` at `at`, and returns the list *and* the key it
 * minted — the caller needs it to select the new block straight away, and
 * minting a second one to find it would defeat the point of a stable key.
 */
export function insertBlock(
  blocks: readonly ContentBlock[],
  type: string,
  at: number,
): { readonly blocks: readonly ContentBlock[]; readonly key: string | null } {
  if (blockDefinition(type) === undefined) return { blocks, key: null }
  const key = freshBlockKey()
  const next = [...blocks]
  next.splice(Math.max(0, Math.min(at, blocks.length)), 0, { key, type, data: {} })
  return { blocks: next, key }
}

export function removeBlock(blocks: readonly ContentBlock[], key: string): readonly ContentBlock[] {
  const index = indexOfKey(blocks, key)
  return index === -1 ? blocks : blocks.filter((block) => block.key !== key)
}

export function updateBlockData(
  blocks: readonly ContentBlock[],
  key: string,
  data: Readonly<Record<string, unknown>>,
): readonly ContentBlock[] {
  const index = indexOfKey(blocks, key)
  if (index === -1) return blocks
  return blocks.map((block) => (block.key === key ? { ...block, data } : block))
}

/**
 * Says whether a `(type, field)` pair may be written from a text node in the
 * preview.
 *
 * The preview's `data-field` attributes are written by the theme, so this is
 * not a trust boundary — but it is a correctness one. A theme that grew a
 * `data-field="items"` on a list would otherwise let an inline edit replace a
 * structured array with a string, silently destroying the block's content.
 * Only a declared, plain-text field of that very block type is writable.
 */
export function isInlineEditable(type: string, field: string): boolean {
  const definition = blockDefinition(type)
  if (definition === undefined) return false
  const declared = definition.fields.find((candidate) => candidate.name === field)
  return declared !== undefined && INLINE_EDITABLE_KINDS.has(declared.kind)
}

/**
 * Writes one plain-text field of one block, from an inline edit in the preview.
 *
 * Text in, text out: what arrives here is `textContent` read off a node, never
 * `innerHTML`. There is no path from the preview to a stored tag, which is
 * what makes R3 hold no matter what an editor pastes into a `contenteditable`.
 */
export function setInlineText(
  blocks: readonly ContentBlock[],
  key: string,
  field: string,
  text: string,
): readonly ContentBlock[] {
  const block = blocks.find((candidate) => candidate.key === key)
  if (block === undefined) return blocks
  if (!isInlineEditable(block.type, field)) return blocks
  if (block.data[field] === text) return blocks
  return updateBlockData(blocks, key, { ...block.data, [field]: text })
}
