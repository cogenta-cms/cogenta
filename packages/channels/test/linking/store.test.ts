import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createChannelLinkStore } from '../../src/linking/store.js'
import { testDb } from '../helpers/db.js'

describe('ChannelLinkStore', () => {
  it('links a channel identity after verifying a freshly generated code', async () => {
    const db = await testDb()
    const store = createChannelLinkStore(db)

    const generated = await store.generateCode('user-1', 'telegram')
    const verified = await store.verifyCode(generated.code, 'telegram', 'chat-42')

    expect(verified.userId).toBe('user-1')
    const identity = await store.resolveIdentity('telegram', 'chat-42')
    expect(identity).toEqual({
      channelName: 'telegram',
      channelUserId: 'chat-42',
      linkedUserId: 'user-1',
    })
  })

  it('is case-insensitive and whitespace-tolerant when a code is typed by hand', async () => {
    const db = await testDb()
    const store = createChannelLinkStore(db)
    const generated = await store.generateCode('user-1', 'telegram')

    const verified = await store.verifyCode(
      `  ${generated.code.toLowerCase()}  `,
      'telegram',
      'chat-42',
    )
    expect(verified.userId).toBe('user-1')
  })

  it('resolves an identity with no link to a null linkedUserId, never an error', async () => {
    const db = await testDb()
    const store = createChannelLinkStore(db)

    const identity = await store.resolveIdentity('telegram', 'unknown-chat')
    expect(identity).toEqual({
      channelName: 'telegram',
      channelUserId: 'unknown-chat',
      linkedUserId: null,
    })
  })

  it('rejects a nonexistent code with the uniform CHANNEL_LINK_CODE_INVALID error', async () => {
    const db = await testDb()
    const store = createChannelLinkStore(db)

    await expect(store.verifyCode('NOTREAL1', 'telegram', 'chat-42')).rejects.toMatchObject({
      code: 'CHANNEL_LINK_CODE_INVALID',
    })
    expect(await store.resolveIdentity('telegram', 'chat-42')).toMatchObject({ linkedUserId: null })
  })

  it('rejects a code that has already been used, with the same uniform error', async () => {
    const db = await testDb()
    const store = createChannelLinkStore(db)
    const generated = await store.generateCode('user-1', 'telegram')
    await store.verifyCode(generated.code, 'telegram', 'chat-42')

    await expect(store.verifyCode(generated.code, 'telegram', 'chat-99')).rejects.toBeInstanceOf(
      CogentaError,
    )
    await expect(store.verifyCode(generated.code, 'telegram', 'chat-99')).rejects.toMatchObject({
      code: 'CHANNEL_LINK_CODE_INVALID',
    })
  })

  it('rejects an expired code, using the injected clock', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const store = createChannelLinkStore(db, () => clock)
    const generated = await store.generateCode('user-1', 'telegram', { ttlMs: 60_000 })

    clock += 60_001
    await expect(store.verifyCode(generated.code, 'telegram', 'chat-42')).rejects.toMatchObject({
      code: 'CHANNEL_LINK_CODE_INVALID',
    })
  })

  it('rejects a code presented against the wrong channel type', async () => {
    const db = await testDb()
    const store = createChannelLinkStore(db)
    const generated = await store.generateCode('user-1', 'telegram')

    await expect(store.verifyCode(generated.code, 'slack', 'chat-42')).rejects.toMatchObject({
      code: 'CHANNEL_LINK_CODE_INVALID',
    })
  })

  it('reverts to unlinked after revocation', async () => {
    const db = await testDb()
    const store = createChannelLinkStore(db)
    const generated = await store.generateCode('user-1', 'telegram')
    await store.verifyCode(generated.code, 'telegram', 'chat-42')

    await store.revoke('telegram', 'chat-42')

    const identity = await store.resolveIdentity('telegram', 'chat-42')
    expect(identity.linkedUserId).toBeNull()
  })

  it('revoking an identity that was never linked is not an error', async () => {
    const db = await testDb()
    const store = createChannelLinkStore(db)
    await expect(store.revoke('telegram', 'never-linked')).resolves.toBeUndefined()
  })

  it('lists every currently-linked channel for a user, excluding revoked ones', async () => {
    const db = await testDb()
    const store = createChannelLinkStore(db)

    const tg = await store.generateCode('user-1', 'telegram')
    await store.verifyCode(tg.code, 'telegram', 'chat-42')
    const slack = await store.generateCode('user-1', 'slack')
    await store.verifyCode(slack.code, 'slack', 'workspace-9')
    const other = await store.generateCode('user-2', 'telegram')
    await store.verifyCode(other.code, 'telegram', 'chat-77')

    await store.revoke('slack', 'workspace-9')

    const linked = await store.listLinkedChannels('user-1')
    expect(linked).toHaveLength(1)
    expect(linked[0]).toMatchObject({ channelName: 'telegram', channelUserId: 'chat-42' })
  })

  it('re-linking the same channel identity replaces the previous link', async () => {
    const db = await testDb()
    const store = createChannelLinkStore(db)

    const first = await store.generateCode('user-1', 'telegram')
    await store.verifyCode(first.code, 'telegram', 'chat-42')
    const second = await store.generateCode('user-2', 'telegram')
    await store.verifyCode(second.code, 'telegram', 'chat-42')

    const identity = await store.resolveIdentity('telegram', 'chat-42')
    expect(identity.linkedUserId).toBe('user-2')
  })
})
