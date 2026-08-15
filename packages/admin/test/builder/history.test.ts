import { describe, expect, it } from 'vitest'
import {
  canRedo,
  canUndo,
  createHistory,
  HISTORY_DEPTH,
  push,
  redo,
  reset,
  undo,
} from '../../src/builder/history.js'

describe('undo and redo on layout actions (L16 task 5)', () => {
  it('has nothing to undo before anything has been done', () => {
    const history = createHistory(['a'])
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
    expect(undo(history)).toBe(history)
    expect(redo(history)).toBe(history)
  })

  it('walks back and forward through a sequence of edits', () => {
    let history = createHistory(['a'])
    history = push(history, ['a', 'b'])
    history = push(history, ['a', 'b', 'c'])

    history = undo(history)
    expect(history.present).toEqual(['a', 'b'])
    history = undo(history)
    expect(history.present).toEqual(['a'])
    expect(canUndo(history)).toBe(false)

    history = redo(history)
    expect(history.present).toEqual(['a', 'b'])
    history = redo(history)
    expect(history.present).toEqual(['a', 'b', 'c'])
    expect(canRedo(history)).toBe(false)
  })

  it('drops the redo branch once a new edit is made after an undo', () => {
    let history = createHistory(['a'])
    history = push(history, ['a', 'b'])
    history = undo(history)
    expect(canRedo(history)).toBe(true)

    history = push(history, ['a', 'z'])
    // Redoing to `['a','b']` here would jump to a page that no longer follows
    // from what is on screen.
    expect(canRedo(history)).toBe(false)
    expect(history.present).toEqual(['a', 'z'])
  })

  it('records no step for an action that changed nothing', () => {
    const start = createHistory(['a'])
    const same = push(start, start.present)
    expect(same).toBe(start)
    expect(canUndo(same)).toBe(false)
  })

  it('forgets the oldest steps rather than growing without a bound', () => {
    let history = createHistory(0)
    for (let step = 1; step <= HISTORY_DEPTH + 20; step += 1) history = push(history, step)

    expect(history.past).toHaveLength(HISTORY_DEPTH)
    expect(history.present).toBe(HISTORY_DEPTH + 20)
    // The oldest surviving step, not step 0.
    expect(history.past[0]).toBe(20)
  })

  it('starts a fresh timeline when the entry itself was replaced', () => {
    let history = createHistory(['a'])
    history = push(history, ['a', 'b'])
    // A version restore is not an edit: undoing past it would be a second,
    // unlabelled restore of content the editor never chose.
    const restored = reset(['from', 'version', '3'])
    expect(canUndo(restored)).toBe(false)
    expect(canRedo(restored)).toBe(false)
    expect(restored.present).toEqual(['from', 'version', '3'])
  })

  it('keeps the present intact across a full undo/redo round trip', () => {
    const first = ['a']
    const second = ['a', 'b']
    let history = push(createHistory(first), second)
    history = redo(undo(history))
    // The same array, not a copy of it: nothing in the stack rebuilds values.
    expect(history.present).toBe(second)
  })
})
