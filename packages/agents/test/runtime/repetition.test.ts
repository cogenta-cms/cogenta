import { describe, expect, it } from 'vitest'
import { RepetitionGuard } from '../../src/runtime/repetition.js'

describe('RepetitionGuard', () => {
  it('does not flag a call that has never been made', () => {
    const guard = new RepetitionGuard(2)
    expect(guard.wouldRepeat({ id: '1', name: 'x', input: { a: 1 } })).toBe(false)
  })

  it('flags a call once it has already been made maxRepeats times', () => {
    const guard = new RepetitionGuard(2)
    const call = { id: '1', name: 'content.publish', input: { id: 'e1' } }

    guard.record(call)
    expect(guard.wouldRepeat(call)).toBe(false)
    guard.record(call)
    expect(guard.wouldRepeat(call)).toBe(true)
  })

  it('treats input key order as irrelevant to the signature', () => {
    const guard = new RepetitionGuard(1)
    guard.record({ id: '1', name: 'x', input: { a: 1, b: 2 } })

    expect(guard.wouldRepeat({ id: '2', name: 'x', input: { b: 2, a: 1 } })).toBe(true)
  })

  it('does not conflate calls to different tools with the same input', () => {
    const guard = new RepetitionGuard(1)
    guard.record({ id: '1', name: 'tool-a', input: { id: 'e1' } })

    expect(guard.wouldRepeat({ id: '2', name: 'tool-b', input: { id: 'e1' } })).toBe(false)
  })

  it('does not conflate calls to the same tool with different input', () => {
    const guard = new RepetitionGuard(1)
    guard.record({ id: '1', name: 'x', input: { id: 'e1' } })

    expect(guard.wouldRepeat({ id: '2', name: 'x', input: { id: 'e2' } })).toBe(false)
  })
})
