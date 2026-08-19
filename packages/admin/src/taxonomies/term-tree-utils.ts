import type { Term } from '../api/taxonomy-client.js'

/**
 * Pure tree logic for the taxonomy screen (`08-taxonomies.md`, task 2).
 *
 * Mirrors `builder/block-moves.ts`'s split: everything that decides *what* a
 * reorder or a re-parent means lives here, with no DOM and no fetch, so it is
 * cheap to test exhaustively — including the two refusals a materialised path
 * has to make (a cycle, and a subtree that would land past the depth bound).
 * `term-tree.tsx` only ever calls these and then plays the plan back through
 * `taxonomy-client.ts`.
 *
 * Nothing here mutates a term's `position` optimistically in the browser: a
 * plan is a description of the calls to make, and the caller reloads the
 * real list from the server afterwards. The server is the one truth for
 * order, exactly as it is for the tree shape.
 */

/**
 * Mirrors `MAX_TAXONOMY_DEPTH` from `@cogenta/schema` (ADR-0022) — the admin
 * never imports the schema modules (it is a browser bundle), so this is the
 * same hand-kept copy every other admin/server boundary in this codebase
 * already lives with.
 */
export const MAX_TAXONOMY_DEPTH = 12

export interface ReorderPlan {
  /** A re-parent, when the action changes which term is the parent. */
  readonly move?: { readonly id: string; readonly parent: string | null }
  /** Position assignments to send after `move` (if any), in this order. */
  readonly positions: readonly { readonly id: string; readonly position: number }[]
}

/** A parent's direct children, in the order the server already listed them. */
export function childrenOf(terms: readonly Term[], parentId: string | null): readonly Term[] {
  return terms.filter((term) => term.parent === parentId)
}

function byId(terms: readonly Term[], id: string): Term | undefined {
  return terms.find((term) => term.id === id)
}

/** True when `candidateId` is `ancestorId` itself, or sits anywhere beneath it. */
export function isSelfOrDescendant(
  terms: readonly Term[],
  ancestorId: string,
  candidateId: string,
): boolean {
  if (candidateId === ancestorId) return true
  let current = byId(terms, candidateId)
  while (current?.parent != null) {
    if (current.parent === ancestorId) return true
    current = byId(terms, current.parent)
  }
  return false
}

/** How many levels below `id` its deepest descendant sits — 0 for a leaf. */
export function subtreeHeight(terms: readonly Term[], id: string): number {
  const children = childrenOf(terms, id)
  if (children.length === 0) return 0
  return 1 + Math.max(...children.map((child) => subtreeHeight(terms, child.id)))
}

/**
 * Whether moving `term` under `newParentId` would push its deepest
 * descendant past `MAX_TAXONOMY_DEPTH` — the same check the store makes on
 * the whole subtree, not just on `term` itself (a three-level branch must not
 * slide past the bound one level at a time).
 */
export function wouldExceedDepth(
  terms: readonly Term[],
  term: Term,
  newParentId: string | null,
): boolean {
  const newParentDepth = newParentId === null ? -1 : (byId(terms, newParentId)?.depth ?? -1)
  const newDepth = newParentDepth + 1
  return newDepth + subtreeHeight(terms, term.id) >= MAX_TAXONOMY_DEPTH
}

/** Every descendant of `id`, direct or not — for "this move takes N terms with it". */
export function subtreeSize(terms: readonly Term[], id: string): number {
  return childrenOf(terms, id).reduce((total, child) => total + 1 + subtreeSize(terms, child.id), 0)
}

export function canMoveUp(terms: readonly Term[], term: Term): boolean {
  const siblings = childrenOf(terms, term.parent)
  return siblings.findIndex((sibling) => sibling.id === term.id) > 0
}

export function canMoveDown(terms: readonly Term[], term: Term): boolean {
  const siblings = childrenOf(terms, term.parent)
  const index = siblings.findIndex((sibling) => sibling.id === term.id)
  return index !== -1 && index < siblings.length - 1
}

/** Indenting makes a term the last child of its immediately preceding sibling. */
export function canIndent(terms: readonly Term[], term: Term): boolean {
  const siblings = childrenOf(terms, term.parent)
  const index = siblings.findIndex((sibling) => sibling.id === term.id)
  if (index <= 0) return false
  const newParent = siblings[index - 1]
  return newParent !== undefined && !wouldExceedDepth(terms, term, newParent.id)
}

/**
 * Dedenting makes a term the last child of its current parent's own parent.
 *
 * `terms` is unused here — dedenting only ever *reduces* depth, so it can
 * never hit the bound `canIndent` has to check — but it stays in the
 * signature to match the other three `can*` predicates this file exports,
 * every one of which a caller can call the same way.
 */
export function canDedent(_terms: readonly Term[], term: Term): boolean {
  return term.parent !== null
}

export function planMoveUp(terms: readonly Term[], term: Term): ReorderPlan | null {
  if (!canMoveUp(terms, term)) return null
  const siblings = childrenOf(terms, term.parent)
  const index = siblings.findIndex((sibling) => sibling.id === term.id)
  const previous = siblings[index - 1]
  if (previous === undefined) return null
  return {
    positions: [
      { id: term.id, position: previous.position },
      { id: previous.id, position: term.position },
    ],
  }
}

export function planMoveDown(terms: readonly Term[], term: Term): ReorderPlan | null {
  if (!canMoveDown(terms, term)) return null
  const siblings = childrenOf(terms, term.parent)
  const index = siblings.findIndex((sibling) => sibling.id === term.id)
  const next = siblings[index + 1]
  if (next === undefined) return null
  return {
    positions: [
      { id: term.id, position: next.position },
      { id: next.id, position: term.position },
    ],
  }
}

/**
 * Indent: reparents `term` under its immediately preceding sibling, appended
 * after that sibling's own children. Never a cycle by construction — a
 * preceding sibling can never be `term`'s descendant.
 */
export function planIndent(terms: readonly Term[], term: Term): ReorderPlan | null {
  if (!canIndent(terms, term)) return null
  const siblings = childrenOf(terms, term.parent)
  const index = siblings.findIndex((sibling) => sibling.id === term.id)
  const newParent = siblings[index - 1]
  if (newParent === undefined) return null
  const newSiblings = childrenOf(terms, newParent.id)
  return {
    move: { id: term.id, parent: newParent.id },
    positions: [{ id: term.id, position: newSiblings.length }],
  }
}

/**
 * Dedent: reparents `term` under its current parent's parent, appended at
 * the end — not necessarily immediately after its old parent. A caller who
 * wants that exact spot uses the move-up/move-down buttons afterwards; this
 * is the same trade-off `TaxonomyStore.move()` already makes for any
 * re-parent (only a move pays, and it always lands last).
 */
export function planDedent(terms: readonly Term[], term: Term): ReorderPlan | null {
  if (!canDedent(terms, term)) return null
  const oldParent = byId(terms, term.parent ?? '')
  const newParentId = oldParent?.parent ?? null
  const newSiblings = childrenOf(terms, newParentId)
  return {
    move: { id: term.id, parent: newParentId },
    positions: [{ id: term.id, position: newSiblings.length }],
  }
}

/**
 * Drag-and-drop onto another term's row (`08-taxonomies.md`, task 2).
 *
 * Dropping onto a **sibling** reorders: `dragged` is inserted immediately
 * before `target` among the same parent's children. Dropping onto a term
 * with a **different** parent nests: `dragged` becomes the last child of
 * `target`. One gesture, two outcomes, distinguished by whether the two
 * terms already share a parent — the same reasoning a file manager applies to
 * dropping an item on a sibling file versus on a folder.
 *
 * Returns `null` for every refusal a materialised path has to make: dropping
 * a term onto itself, onto its own descendant (a cycle), or somewhere that
 * would push it — or its deepest descendant — past the depth bound. The
 * server re-checks all three regardless; this is what lets the tree grey out
 * an impossible drop instead of accepting it and then rolling back.
 */
export function planDropOnto(
  terms: readonly Term[],
  draggedId: string,
  targetId: string,
): ReorderPlan | null {
  const dragged = byId(terms, draggedId)
  const target = byId(terms, targetId)
  if (dragged === undefined || target === undefined) return null
  if (isSelfOrDescendant(terms, draggedId, targetId)) return null

  const sameParent = dragged.parent === target.parent
  if (sameParent) {
    const siblings = childrenOf(terms, dragged.parent).filter((term) => term.id !== draggedId)
    const index = siblings.findIndex((sibling) => sibling.id === targetId)
    const order = [...siblings.slice(0, index), dragged, ...siblings.slice(index)]
    return { positions: order.map((term, position) => ({ id: term.id, position })) }
  }

  if (wouldExceedDepth(terms, dragged, target.id)) return null
  const children = childrenOf(terms, target.id)
  return {
    move: { id: draggedId, parent: target.id },
    positions: [{ id: draggedId, position: children.length }],
  }
}
