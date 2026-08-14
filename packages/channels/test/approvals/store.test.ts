import { describe, expect, it } from 'vitest'
import { createApprovalTokenStore } from '../../src/approvals/store.js'

describe('createApprovalTokenStore', () => {
  it('issues a token that peeks as ready for the right request', () => {
    const store = createApprovalTokenStore()
    const { token } = store.issue('req-1', 'content.publish')

    expect(store.peek(token)).toEqual({
      kind: 'ready',
      requestId: 'req-1',
      requiredRole: 'content.publish',
    })
  })

  it('defaults requiredRole to null when omitted', () => {
    const store = createApprovalTokenStore()
    const { token } = store.issue('req-1')

    expect(store.peek(token)).toEqual({ kind: 'ready', requestId: 'req-1', requiredRole: null })
  })

  it('an unknown token is invalid', () => {
    const store = createApprovalTokenStore()
    expect(store.peek('NOTAREALTOKEN')).toEqual({ kind: 'invalid' })
  })

  it('an expired token is reported expired, using the injected clock', () => {
    let clock = 0
    const store = createApprovalTokenStore({ now: () => clock })
    const { token } = store.issue('req-1')

    clock += 20 * 60 * 1000 + 1
    expect(store.peek(token)).toEqual({ kind: 'expired' })
  })

  it('a decided token reports its outcome instead of erroring — never a raw failure', () => {
    const store = createApprovalTokenStore()
    const { token } = store.issue('req-1')

    store.markDecided(token, 'approved')

    expect(store.peek(token)).toEqual({ kind: 'already_decided', decision: 'approved' })
  })

  it('REUSE: redeeming an already-decided token again still reports already_decided, never re-executes', () => {
    const store = createApprovalTokenStore()
    const { token } = store.issue('req-1')

    store.markDecided(token, 'rejected')
    store.markDecided(token, 'approved') // a second, malicious/duplicate attempt

    // The first decision wins — a token cannot be flipped after the fact.
    expect(store.peek(token)).toEqual({ kind: 'already_decided', decision: 'rejected' })
  })

  it('two tokens issued for the same request are independent (approve/deny pair)', () => {
    const store = createApprovalTokenStore()
    const approve = store.issue('req-1')
    const deny = store.issue('req-1')

    store.markDecided(approve.token, 'approved')

    expect(store.peek(approve.token)).toEqual({ kind: 'already_decided', decision: 'approved' })
    expect(store.peek(deny.token)).toEqual({
      kind: 'ready',
      requestId: 'req-1',
      requiredRole: null,
    })
  })

  it('markDecided on an unknown token is a harmless no-op', () => {
    const store = createApprovalTokenStore()
    expect(() => store.markDecided('NOTAREALTOKEN', 'approved')).not.toThrow()
  })
})
