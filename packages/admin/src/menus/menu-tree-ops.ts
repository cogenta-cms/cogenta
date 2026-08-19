import type { MenuItem } from '../api/menu-client.js'

/**
 * Every tree-shape action the menu editor can take, as pure functions on the
 * item list (fiche 09, task 2).
 *
 * They live apart from the components for the same reason `block-moves.ts`
 * does: they are what undo relies on if a caller adds it, they are the only
 * place that decides what a drag or a button is allowed to do to the tree,
 * and that is worth testing without a DOM. None of them talks to the network
 * — `buildReorderPayload` is the one function that turns the *result* into
 * the single batch `reorderMenuItems` sends, so a whole session (indent,
 * drag, undo, indent again) costs one request when the editor is done, never
 * one per intermediate step.
 *
 * Deep enough for any real navigation — mirrors `MAX_MENU_DEPTH` in
 * `@cogenta/schema`'s `menu-store.ts`. Kept as a local constant rather than
 * imported: this is a browser bundle, and duplicating one number is cheaper
 * than pulling a Node package's dependency graph into it. The server is the
 * real gate either way — this only keeps the on-screen tree from previewing
 * a shape the save would refuse.
 */
const MAX_MENU_DEPTH = 8

export interface ReorderUpdate {
  readonly id: string
  readonly parent: string | null
  readonly position: number
}

/** Every item directly under `parent`, in their current relative order. */
export function siblingsOf(items: readonly MenuItem[], parent: string | null): readonly MenuItem[] {
  return items.filter((item) => item.parent === parent)
}

/**
 * The canonical render order: parent immediately before its children,
 * siblings sorted by `position` — the same walk `MenuStore`'s `orderAsTree`
 * does server-side, reimplemented here because the admin needs it after
 * every local edit, before a save round-trip confirms anything.
 */
function orderAsTree(items: readonly MenuItem[]): MenuItem[] {
  const byParent = new Map<string | null, MenuItem[]>()
  for (const item of items) {
    const group = byParent.get(item.parent) ?? []
    group.push(item)
    byParent.set(item.parent, group)
  }
  for (const group of byParent.values()) group.sort((a, b) => a.position - b.position)

  const ordered: MenuItem[] = []
  const visit = (parent: string | null): void => {
    for (const item of byParent.get(parent) ?? []) {
      ordered.push(item)
      visit(item.id)
    }
  }
  visit(null)
  return ordered
}

function depthOfId(items: readonly MenuItem[], id: string | null): number {
  if (id === null) return 0
  const item = items.find((candidate) => candidate.id === id)
  if (item === undefined) return 0
  return 1 + depthOfId(items, item.parent)
}

/** Recomputes `depth` for every item from `parent`, never trusting a stale copy. */
function withDepth(items: readonly MenuItem[]): MenuItem[] {
  return items.map((item) => ({ ...item, depth: depthOfId(items, item.parent) }))
}

/** True when `candidateId` is `ancestorId` itself, or sits anywhere below it. */
export function isSelfOrDescendant(
  items: readonly MenuItem[],
  candidateId: string,
  ancestorId: string,
): boolean {
  let cursor: string | null = candidateId
  while (cursor !== null) {
    if (cursor === ancestorId) return true
    cursor = items.find((item) => item.id === cursor)?.parent ?? null
  }
  return false
}

/**
 * Moves `id` under `newParent`, positioned immediately before/after
 * `referenceId` among `newParent`'s *other* children — `null` for
 * `referenceId` means "at the start or end of the group" instead. Computing
 * the insertion point against the group with `id` already removed is what
 * makes this correct whether `id` is already one of `newParent`'s children
 * (a plain reorder) or arriving from elsewhere (a re-parent): there is no
 * separate index arithmetic to get right for either case.
 */
function reparentRelativeTo(
  items: readonly MenuItem[],
  id: string,
  newParent: string | null,
  referenceId: string | null,
  after: boolean,
): readonly MenuItem[] {
  const moved = items.find((item) => item.id === id)
  if (moved === undefined) return items

  const withoutMoved = items.filter((item) => item.id !== id)
  const newSiblings = siblingsOf(withoutMoved, newParent)

  const referenceIndex =
    referenceId === null ? -1 : newSiblings.findIndex((item) => item.id === referenceId)
  const insertAt =
    referenceIndex === -1
      ? after
        ? newSiblings.length
        : 0
      : after
        ? referenceIndex + 1
        : referenceIndex

  const rewritten = [
    ...newSiblings.slice(0, insertAt),
    { ...moved, parent: newParent },
    ...newSiblings.slice(insertAt),
  ].map((item, index) => ({ ...item, position: index }))

  const rewrittenIds = new Set(rewritten.map((item) => item.id))
  const untouched = withoutMoved.filter((item) => !rewrittenIds.has(item.id))

  return withDepth(orderAsTree([...untouched, ...rewritten]))
}

/** Applies `candidate`, unless it would nest something past `MAX_MENU_DEPTH` — the same bound the server enforces. */
function guardDepth(
  original: readonly MenuItem[],
  candidate: readonly MenuItem[],
): readonly MenuItem[] {
  const deepest = candidate.reduce((max, item) => Math.max(max, item.depth), 0)
  return deepest >= MAX_MENU_DEPTH ? original : candidate
}

/** Swaps `id` with the sibling immediately before it. A no-op at the top of its group. */
export function moveUp(items: readonly MenuItem[], id: string): readonly MenuItem[] {
  const item = items.find((candidate) => candidate.id === id)
  if (item === undefined) return items
  const siblings = siblingsOf(items, item.parent)
  const index = siblings.findIndex((candidate) => candidate.id === id)
  if (index <= 0) return items
  const previous = siblings[index - 1]
  if (previous === undefined) return items
  return reparentRelativeTo(items, id, item.parent, previous.id, false)
}

/** Swaps `id` with the sibling immediately after it. A no-op at the bottom of its group. */
export function moveDown(items: readonly MenuItem[], id: string): readonly MenuItem[] {
  const item = items.find((candidate) => candidate.id === id)
  if (item === undefined) return items
  const siblings = siblingsOf(items, item.parent)
  const index = siblings.findIndex((candidate) => candidate.id === id)
  if (index === -1 || index >= siblings.length - 1) return items
  const next = siblings[index + 1]
  if (next === undefined) return items
  return reparentRelativeTo(items, id, item.parent, next.id, true)
}

/**
 * Nests `id` as the last child of the sibling immediately above it — the
 * only sibling it *can* nest under, the same rule every menu editor with an
 * indent button uses. A no-op for the first item of a group, which has no
 * preceding sibling to nest under.
 */
export function indent(items: readonly MenuItem[], id: string): readonly MenuItem[] {
  const item = items.find((candidate) => candidate.id === id)
  if (item === undefined) return items
  const siblings = siblingsOf(items, item.parent)
  const index = siblings.findIndex((candidate) => candidate.id === id)
  if (index <= 0) return items
  const newParent = siblings[index - 1]
  if (newParent === undefined || newParent.id === id) return items
  return guardDepth(items, reparentRelativeTo(items, id, newParent.id, null, true))
}

/** Un-nests `id` to sit right after its current parent, as that parent's own sibling. A no-op at the top level. */
export function outdent(items: readonly MenuItem[], id: string): readonly MenuItem[] {
  const item = items.find((candidate) => candidate.id === id)
  if (item === undefined || item.parent === null) return items
  const parentItem = items.find((candidate) => candidate.id === item.parent)
  if (parentItem === undefined) return items
  return reparentRelativeTo(items, id, parentItem.parent, parentItem.id, true)
}

/**
 * Drops `draggedId` as a sibling of `targetId`, immediately before or after
 * it (`after`) — the "drop above/below this row" half of drag-and-drop.
 * Refuses (returns `items` unchanged) a drop onto the dragged item's own
 * subtree, the same cycle the server refuses (`MENU_CYCLE`), so the on-screen
 * tree never shows an impossible shape even before a save round-trip.
 */
export function dropBeforeOrAfter(
  items: readonly MenuItem[],
  draggedId: string,
  targetId: string,
  after: boolean,
): readonly MenuItem[] {
  if (draggedId === targetId) return items
  const target = items.find((item) => item.id === targetId)
  if (target === undefined) return items
  if (isSelfOrDescendant(items, target.id, draggedId)) return items
  return guardDepth(items, reparentRelativeTo(items, draggedId, target.parent, target.id, after))
}

/** Drops `draggedId` as the last child of `newParentId` — the "drop into this row" half of drag-and-drop. */
export function dropInto(
  items: readonly MenuItem[],
  draggedId: string,
  newParentId: string,
): readonly MenuItem[] {
  if (draggedId === newParentId) return items
  if (isSelfOrDescendant(items, newParentId, draggedId)) return items
  return guardDepth(items, reparentRelativeTo(items, draggedId, newParentId, null, true))
}

/**
 * The whole tree's current `{id, parent, position}`, renumbered group by
 * group into a clean `0..n-1` — always the full set, never a computed diff.
 * This is what `reorderMenuItems` sends in one call: a menu is small enough
 * that resending every row costs nothing, and it is what keeps the batch
 * simple enough to reason about (no separate "what actually changed" logic
 * to get right on top of the tree ops above).
 */
export function buildReorderPayload(items: readonly MenuItem[]): readonly ReorderUpdate[] {
  const parents = new Set(items.map((item) => item.parent))
  const updates: ReorderUpdate[] = []
  for (const parent of parents) {
    siblingsOf(items, parent).forEach((item, index) => {
      updates.push({ id: item.id, parent: item.parent, position: index })
    })
  }
  return updates
}
