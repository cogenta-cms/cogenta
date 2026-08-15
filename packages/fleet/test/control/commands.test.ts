import { verifyContentSignature } from '@cogenta/plugins'
import { beforeEach, describe, expect, it } from 'vitest'
import { dispatchFleetCommand, verifyFleetCommand } from '../../src/agent/commands.js'
import { createCommandQueueStore, type SignedFleetCommand } from '../../src/control/commands.js'
import { generateControlPlaneIdentity } from '../../src/control/identity.js'
import { createEnrollmentStore } from '../../src/enrollment/store.js'
import { testDb } from '../helpers/db.js'

function must<T>(value: T | undefined): T {
  expect(value).toBeDefined()
  return value as T
}

describe('fleet commands: queueing, signing, per-site isolation', () => {
  let db: Awaited<ReturnType<typeof testDb>>
  const controlPlane = generateControlPlaneIdentity()

  beforeEach(async () => {
    db = await testDb()
  })

  it('a command enqueued for site A is fetchable by A and invisible to site B', async () => {
    const queue = createCommandQueueStore(db, controlPlane)

    await queue.enqueue('site-a', 'update', { version: '1.2.0' })

    const forA = await queue.fetchPending('site-a')
    expect(forA).toHaveLength(1)
    expect(must(forA[0]).command.action).toBe('update')

    const forB = await queue.fetchPending('site-b')
    expect(forB).toHaveLength(0)
  })

  it('fetching marks commands delivered — a second fetch never sees the same command again', async () => {
    const queue = createCommandQueueStore(db, controlPlane)
    await queue.enqueue('site-a', 'rollback', { toVersion: '1.1.0' })

    const first = await queue.fetchPending('site-a')
    expect(first).toHaveLength(1)

    const second = await queue.fetchPending('site-a')
    expect(second).toHaveLength(0)
  })

  it("signs each command with the control plane's real private key, verifiable against its public key", async () => {
    const queue = createCommandQueueStore(db, controlPlane)
    await queue.enqueue('site-a', 'update', { version: '2.0.0' })

    const [maybeSigned] = await queue.fetchPending('site-a')
    const signed = must(maybeSigned)
    expect(
      verifyContentSignature(signed.command, signed.signatureBase64, controlPlane.publicKey),
    ).toBe(true)
  })
})

describe('fleet commands: site-side verification and dispatch', () => {
  let db: Awaited<ReturnType<typeof testDb>>
  const controlPlane = generateControlPlaneIdentity()
  const otherControlPlane = generateControlPlaneIdentity()

  beforeEach(async () => {
    db = await testDb()
  })

  async function firstPending(siteId: string, queue: ReturnType<typeof createCommandQueueStore>) {
    const [maybeSigned] = await queue.fetchPending(siteId)
    return must(maybeSigned)
  }

  it('a validly signed, whitelisted command verifies and dispatches to its real handler', async () => {
    const queue = createCommandQueueStore(db, controlPlane)
    await queue.enqueue('site-a', 'update', { version: '3.0.0' })
    const signed = await firstPending('site-a', queue)

    let receivedPayload: unknown
    const result = await dispatchFleetCommand(signed, controlPlane.publicKey, {
      update: async (payload) => {
        receivedPayload = payload
      },
    })

    expect(result).toEqual({ ok: true, executed: true })
    expect(receivedPayload).toEqual({ version: '3.0.0' })
  })

  it('a command signed by a control plane the site does not trust is refused, and no handler is ever called', async () => {
    const queue = createCommandQueueStore(db, controlPlane)
    await queue.enqueue('site-a', 'update', { version: '3.0.0' })
    const signed = await firstPending('site-a', queue)

    // Genuinely, correctly signed — just not by the key this site recorded
    // at pairing. A real Ed25519 signature that simply doesn't match.
    const verification = verifyFleetCommand(signed, otherControlPlane.publicKey)
    expect(verification).toEqual({ ok: false, reason: 'invalid_signature' })

    let called = false
    const result = await dispatchFleetCommand(signed, otherControlPlane.publicKey, {
      update: async () => {
        called = true
      },
    })
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' })
    expect(called).toBe(false)
  })

  it('a command with tampered content fails signature verification even though the signature string is valid base64', async () => {
    const queue = createCommandQueueStore(db, controlPlane)
    await queue.enqueue('site-a', 'update', { version: '3.0.0' })
    const signed = await firstPending('site-a', queue)

    const tampered: SignedFleetCommand = {
      command: { ...signed.command, payload: { version: '999.0.0' } },
      signatureBase64: signed.signatureBase64,
    }
    const verification = verifyFleetCommand(tampered, controlPlane.publicKey)
    expect(verification).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('an unsigned command (empty signature) is refused', async () => {
    const queue = createCommandQueueStore(db, controlPlane)
    await queue.enqueue('site-a', 'rollback', {})
    const signed = await firstPending('site-a', queue)

    const unsigned: SignedFleetCommand = { ...signed, signatureBase64: '' }
    const result = await dispatchFleetCommand(unsigned, controlPlane.publicKey, {
      rollback: async () => {},
    })
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('an action outside the whitelist is refused even with a perfectly valid signature', async () => {
    const queue = createCommandQueueStore(db, controlPlane)
    await queue.enqueue('site-a', 'update', {})
    const signed = await firstPending('site-a', queue)

    // Forge a command whose action is not in FLEET_COMMAND_ACTIONS, signed
    // for real with the control plane's real key — signature validity alone
    // must never be sufficient.
    const forged: SignedFleetCommand = {
      command: { ...signed.command, action: 'delete_everything' as never },
      signatureBase64: signed.signatureBase64,
    }

    let called = false
    const result = await dispatchFleetCommand(forged, controlPlane.publicKey, {
      update: async () => {
        called = true
      },
    })
    expect(result).toEqual({ ok: false, reason: 'action_not_whitelisted' })
    expect(called).toBe(false)
  })

  it('a whitelisted, validly signed command with no registered handler is refused, not silently ignored', async () => {
    const queue = createCommandQueueStore(db, controlPlane)
    await queue.enqueue('site-a', 'rollback', {})
    const signed = await firstPending('site-a', queue)

    const result = await dispatchFleetCommand(signed, controlPlane.publicKey, {})
    expect(result).toEqual({ ok: false, reason: 'no_handler_registered' })
  })
})

describe('control-plane identity and pairing', () => {
  it("a site learns the control plane's real public key at pairing time", async () => {
    const db = await testDb()
    const controlPlane = generateControlPlaneIdentity()
    const enrollment = createEnrollmentStore(db, Date.now, controlPlane)

    const issued = await enrollment.issuePairingToken('site-a')
    expect(issued.controlPlanePublicKey).toBe(controlPlane.publicKey)
    expect(enrollment.getControlPlanePublicKey()).toBe(controlPlane.publicKey)
  })
})
