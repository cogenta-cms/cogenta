import { describe, expect, it } from 'vitest'
import type { ChannelIdentity } from '../../src/adapter.js'
import { authorizeInboundCommand } from '../../src/inbound/authorize.js'

function identity(linkedUserId: string | null): ChannelIdentity {
  return { channelName: 'telegram', channelUserId: 'chan-1', linkedUserId }
}

describe('authorizeInboundCommand', () => {
  it('refuses an unlinked identity, and says a reply must not be sent', async () => {
    const result = await authorizeInboundCommand(identity(null), ['admin'], async () => ['admin'])

    expect(result).toEqual({ ok: false, reason: 'unlinked', shouldReply: false })
  })

  it('never calls getUserRoles for an unlinked identity', async () => {
    let called = false
    await authorizeInboundCommand(identity(null), ['admin'], async () => {
      called = true
      return []
    })

    expect(called).toBe(false)
  })

  it('refuses a linked user who lacks every required role, but allows a reply', async () => {
    const result = await authorizeInboundCommand(identity('user-1'), ['admin'], async () => [
      'viewer',
    ])

    expect(result).toEqual({ ok: false, reason: 'forbidden', shouldReply: true, userId: 'user-1' })
  })

  it('authorizes a linked user holding one of the required roles, carrying their real id', async () => {
    const result = await authorizeInboundCommand(
      identity('user-1'),
      ['editor', 'admin'],
      async () => ['editor'],
    )

    expect(result).toEqual({ ok: true, userId: 'user-1' })
  })

  it('authorizes any linked user when no role is required', async () => {
    const result = await authorizeInboundCommand(identity('user-1'), [], async () => [])

    expect(result).toEqual({ ok: true, userId: 'user-1' })
  })

  it('derives the acting user only from linkedUserId, never from channelUserId', async () => {
    // A spoofed/attacker-controlled channelUserId is irrelevant: only the
    // verified linkedUserId ever appears in an authorized result.
    const spoofed: ChannelIdentity = {
      channelName: 'telegram',
      channelUserId: 'admin',
      linkedUserId: 'real-user-42',
    }

    const result = await authorizeInboundCommand(spoofed, [], async (userId) => {
      expect(userId).toBe('real-user-42')
      return []
    })

    expect(result).toEqual({ ok: true, userId: 'real-user-42' })
  })
})
