/**
 * Undo/redo for the page builder's layout actions (L16 task 5).
 *
 * A plain value, with plain functions over it, so the behaviour is testable
 * without rendering anything — and so the React hook that uses it holds one
 * `useState` rather than three that can disagree.
 *
 * What it records is the *block list*, never a description of an action. An
 * "undo drag" that replays the inverse of a move has to be right about every
 * kind of edit separately, and gets it wrong the first time two edits are
 * coalesced. Snapshots of an already-small, already-serialisable list cost
 * almost nothing here and cannot be wrong.
 */

/** Enough for a session's worth of edits, small enough that nothing grows unbounded. */
export const HISTORY_DEPTH = 50

export interface History<T> {
  /** Oldest first. The last element is what `undo()` returns to. */
  readonly past: readonly T[]
  readonly present: T
  /** Nearest first. The first element is what `redo()` returns to. */
  readonly future: readonly T[]
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

/**
 * Records a new present.
 *
 * Pushing a value equal to the present is a no-op, so a drag that ends where
 * it started, or a text field blurred without a change, does not put an
 * undo step in front of the one the editor actually wants back.
 *
 * Equality is by `Object.is` on the reference: every mutation in this builder
 * rebuilds the array, so an unchanged list is literally the same array.
 */
export function push<T>(history: History<T>, present: T): History<T> {
  if (Object.is(history.present, present)) return history
  const past = [...history.past, history.present].slice(-HISTORY_DEPTH)
  // A new edit after an undo discards the redo branch — the standard rule,
  // and the only one that does not leave a redo pointing at a page that no
  // longer follows from what is on screen.
  return { past, present, future: [] }
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1)
  if (previous === undefined) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future].slice(0, HISTORY_DEPTH),
  }
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future
  if (next === undefined) return history
  return {
    past: [...history.past, history.present].slice(-HISTORY_DEPTH),
    present: next,
    future: rest,
  }
}

/**
 * Starts again from a value that did not come from an edit — an entry
 * reloaded, a version restored, a translation switched to.
 *
 * Deliberately not a `push`: undoing back *past* a version restore into the
 * content of a different version is not an undo, it is a second, unlabelled
 * restore.
 */
export function reset<T>(present: T): History<T> {
  return createHistory(present)
}
