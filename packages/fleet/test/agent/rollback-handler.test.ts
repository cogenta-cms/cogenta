import { describe, expect, it } from 'vitest'
import { dispatchFleetCommand } from '../../src/agent/commands.js'
import {
  createRollbackIntentHandler,
  type RollbackIntent,
} from '../../src/agent/rollback-handler.js'
import { createCommandQueueStore } from '../../src/control/commands.js'
import { generateControlPlaneIdentity } from '../../src/control/identity.js'
import { testDb } from '../helpers/db.js'

describe('createRollbackIntentHandler', () => {
  it('validates a real, well-formed rollback payload and hands it to the injected callback', async () => {
    const db = await testDb()
    const controlPlane = generateControlPlaneIdentity()
    const commandQueue = createCommandQueueStore(db, controlPlane)
    await commandQueue.enqueue('site-1', 'rollback', {
      componentKind: 'plugin',
      componentName: 'seo-helper',
      targetVersion: '1.0.0',
    })
    const [signed] = await commandQueue.fetchPending('site-1')
    if (signed === undefined) throw new Error('unreachable in test setup')

    const recorded: RollbackIntent[] = []
    const handler = createRollbackIntentHandler(async (intent) => {
      recorded.push(intent)
    })

    const result = await dispatchFleetCommand(signed, controlPlane.publicKey, {
      rollback: handler,
    })

    expect(result).toEqual({ ok: true, executed: true })
    expect(recorded).toEqual([
      { componentKind: 'plugin', componentName: 'seo-helper', targetVersion: '1.0.0' },
    ])
  })

  it('rejects a malformed payload before the callback ever runs — no code-reversion claim on bad data', async () => {
    const handler = createRollbackIntentHandler(async () => {
      throw new Error('must not be called')
    })

    await expect(handler({ componentKind: 'not-a-real-kind' })).rejects.toThrow()
    await expect(handler(null)).rejects.toThrow()
    await expect(handler('a string, not an object')).rejects.toThrow()
  })

  it('a rollback command whose action was tampered with is refused before the handler is ever reached', async () => {
    const db = await testDb()
    const controlPlane = generateControlPlaneIdentity()
    const commandQueue = createCommandQueueStore(db, controlPlane)
    await commandQueue.enqueue('site-1', 'rollback', {
      componentKind: 'plugin',
      componentName: 'seo-helper',
      targetVersion: '1.0.0',
    })
    const [signed] = await commandQueue.fetchPending('site-1')
    if (signed === undefined) throw new Error('unreachable in test setup')

    let called = false
    const handler = createRollbackIntentHandler(async () => {
      called = true
    })

    // A different, non-whitelisted action smuggled into the same signed
    // envelope shape — the whitelist check in `dispatchFleetCommand` must
    // catch this before signature verification even matters here.
    const tampered = {
      ...signed,
      command: { ...signed.command, action: 'delete-everything' as never },
    }
    const result = await dispatchFleetCommand(tampered, controlPlane.publicKey, {
      rollback: handler,
    })

    expect(result).toEqual({ ok: false, reason: 'action_not_whitelisted' })
    expect(called).toBe(false)
  })
})
