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

// ---- Copy / paste (fiche 05 task 2, fiche 43 sub-chantier B) --------------

/**
 * The clipboard payload's own recognition prefix, versioned the way every
 * other exchange format in this codebase is (`export@1.0`, `tools@1.1`…).
 * `format` is read from parsed JSON rather than a MIME type: browsers vary
 * widely in which custom MIME types `navigator.clipboard` will actually
 * write and read, while every browser supports `writeText`/`readText` of a
 * plain string — which is exactly what lets a copy on page A be pasted on
 * page B in a different tab (fiche 05 task 2's own acceptance criterion).
 */
export const CLIPBOARD_FORMAT = 'cogenta/blocks@1'

export interface ClipboardBlocksPayload {
  readonly format: typeof CLIPBOARD_FORMAT
  readonly blocks: readonly ContentBlock[]
}

/** The text `navigator.clipboard.writeText` is given for a copy of `blocks`. */
export function serialiseBlocksForClipboard(blocks: readonly ContentBlock[]): string {
  return JSON.stringify({ format: CLIPBOARD_FORMAT, blocks } satisfies ClipboardBlocksPayload)
}

export type ClipboardParseResult =
  /** Not this format at all — plain text copied from elsewhere. Silently ignored, never an error. */
  | { readonly kind: 'not-ours' }
  | { readonly kind: 'blocks'; readonly blocks: readonly ContentBlock[] }
  /** A block whose `type` this site's vocabulary does not declare — refused wholesale, naming the type (fiche 05's own rule). */
  | { readonly kind: 'unknown-type'; readonly type: string }

/**
 * Parses and validates clipboard text pasted into the builder.
 *
 * The clipboard is an external channel (R8): what comes back from it is
 * data, never trusted as already-valid content. Every block's `type` is
 * checked against `blockDefinition` before any of it is accepted — one
 * unknown type refuses the whole paste, exactly as `insertBlock` already
 * refuses a single unknown type rather than inserting a broken block "just
 * in case".
 */
export function parseClipboardBlocks(text: string): ClipboardParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { kind: 'not-ours' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'not-ours' }
  }
  const record = parsed as Record<string, unknown>
  if (record.format !== CLIPBOARD_FORMAT) return { kind: 'not-ours' }

  const raw = record.blocks
  if (!Array.isArray(raw) || raw.length === 0) return { kind: 'not-ours' }

  const blocks: ContentBlock[] = []
  for (const candidate of raw) {
    if (typeof candidate !== 'object' || candidate === null) return { kind: 'not-ours' }
    const block = candidate as Record<string, unknown>
    const key = block.key
    const type = block.type
    if (typeof key !== 'string' || key.length === 0) return { kind: 'not-ours' }
    if (typeof type !== 'string' || type.length === 0) return { kind: 'not-ours' }
    if (blockDefinition(type) === undefined) return { kind: 'unknown-type', type }
    const data = block.data
    blocks.push({ key, type, data: (data ?? {}) as Readonly<Record<string, unknown>> })
  }
  return { kind: 'blocks', blocks }
}

/**
 * Pastes `pasted` at `at`, each with a *freshly minted* key — never the
 * copied blocks' own keys, which is what makes pasting the same clipboard
 * twice (or into the page it was copied from) safe rather than a key
 * collision `indexOfKey` would silently pick the wrong one out of.
 */
export function pasteBlocks(
  blocks: readonly ContentBlock[],
  pasted: readonly ContentBlock[],
  at: number,
): readonly ContentBlock[] {
  if (pasted.length === 0) return blocks
  const fresh = pasted.map((block) => ({ ...block, key: freshBlockKey() }))
  const next = [...blocks]
  next.splice(Math.max(0, Math.min(at, blocks.length)), 0, ...fresh)
  return next
}

// ---- Multi-select (fiche 05 task 5, fiche 43 sub-chantier E) --------------

/** The default "nothing is locked" set, shared rather than re-allocated per call. */
const EMPTY_KEYS: ReadonlySet<string> = new Set()

/** The blocks a multi-selection names, in page order — what "copy" and "save as pattern" both capture. */
export function blocksOfKeys(
  blocks: readonly ContentBlock[],
  keys: ReadonlySet<string>,
): readonly ContentBlock[] {
  return blocks.filter((block) => keys.has(block.key))
}

/**
 * Removes every block named by `keys`, as **one** edit — never one `remove`
 * per block, which is what would put N undo steps in front of the one an
 * editor actually wants back (fiche 05 §7's own warning: "chaque opération
 * groupée doit produire un seul instantané").
 */
export function removeBlocks(
  blocks: readonly ContentBlock[],
  keys: ReadonlySet<string>,
): readonly ContentBlock[] {
  if (keys.size === 0) return blocks
  const next = blocks.filter((block) => !keys.has(block.key))
  return next.length === blocks.length ? blocks : next
}

/**
 * Moves every selected block up by one slot, as a group: each selected block
 * bubbles past the nearest unselected block above it, in one left-to-right
 * pass — so a contiguous selection moves as a unit, and a scattered one has
 * each member step up independently, without ever crossing another selected
 * block (which would scramble the selection's own relative order).
 *
 * `locked` (fiche 43 sub-chantier E) is a second, distinct set: a block
 * named there is never itself expected to move (the caller already excludes
 * it from `keys`), but it is also a wall nothing else may swap past — a
 * locked header must stay exactly where it is, not merely "not move on its
 * own", or an editor moving the block below it would push the header down
 * as a side effect of a swap that named it only as a neighbour.
 */
export function moveSelectionUp(
  blocks: readonly ContentBlock[],
  keys: ReadonlySet<string>,
  locked: ReadonlySet<string> = EMPTY_KEYS,
): readonly ContentBlock[] {
  if (keys.size === 0) return blocks
  const next = [...blocks]
  let moved = false
  for (let i = 1; i < next.length; i += 1) {
    const current = next[i]
    const previous = next[i - 1]
    if (current === undefined || previous === undefined) continue
    if (keys.has(current.key) && !keys.has(previous.key) && !locked.has(previous.key)) {
      next[i - 1] = current
      next[i] = previous
      moved = true
    }
  }
  return moved ? next : blocks
}

/** The mirror of `moveSelectionUp`, scanning right-to-left. */
export function moveSelectionDown(
  blocks: readonly ContentBlock[],
  keys: ReadonlySet<string>,
  locked: ReadonlySet<string> = EMPTY_KEYS,
): readonly ContentBlock[] {
  if (keys.size === 0) return blocks
  const next = [...blocks]
  let moved = false
  for (let i = next.length - 2; i >= 0; i -= 1) {
    const current = next[i]
    const after = next[i + 1]
    if (current === undefined || after === undefined) continue
    if (keys.has(current.key) && !keys.has(after.key) && !locked.has(after.key)) {
      next[i] = after
      next[i + 1] = current
      moved = true
    }
  }
  return moved ? next : blocks
}
