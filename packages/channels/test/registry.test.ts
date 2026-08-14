import { describe, expect, it } from 'vitest'
import type { ChannelAdapter, ChannelMessage, ChannelTarget, MessageId } from '../src/adapter.js'
import { createChannelRegistry } from '../src/registry.js'

function fakeAdapter(name: string): ChannelAdapter & { readonly sent: ChannelMessage[] } {
  const sent: ChannelMessage[] = []
  return {
    name,
    sent,
    capabilities: {
      richText: false,
      buttons: false,
      threads: false,
      attachments: false,
      inbound: false,
    },
    async send(_target: ChannelTarget, message: ChannelMessage): Promise<MessageId> {
      sent.push(message)
      return `${name}-message-1`
    },
    async verifyIdentity(proof: unknown) {
      return { channelName: name, channelUserId: String(proof), linkedUserId: null }
    },
  }
}

describe('createChannelRegistry', () => {
  it('constructs fine with zero adapters, matching how a site with no channels configured must still work', () => {
    const registry = createChannelRegistry([])
    expect(registry.has('telegram')).toBe(false)
    expect(registry.list()).toEqual([])
  })

  it('get() on an unconfigured name throws a typed, actionable error rather than returning undefined', () => {
    const registry = createChannelRegistry([])
    expect(() => registry.get('telegram')).toThrowError(/No channel adapter named "telegram"/)
  })

  it('refuses two adapters sharing the same name at construction time', () => {
    expect(() =>
      createChannelRegistry([fakeAdapter('telegram'), fakeAdapter('telegram')]),
    ).toThrowError(/Two channel adapters are both named "telegram"/)
  })

  it('round-trips a real adapter through registration, lookup, and send', async () => {
    const telegram = fakeAdapter('telegram')
    const registry = createChannelRegistry([telegram])

    expect(registry.has('telegram')).toBe(true)
    const resolved = registry.get('telegram')
    const messageId = await resolved.send(
      { id: 'chat-1' },
      { level: 'notification', text: 'Backup complete.' },
    )

    expect(messageId).toBe('telegram-message-1')
    expect(telegram.sent).toEqual([{ level: 'notification', text: 'Backup complete.' }])
  })

  it('lists every configured adapter in the order given', () => {
    const registry = createChannelRegistry([fakeAdapter('telegram'), fakeAdapter('slack')])
    expect(registry.list().map((adapter) => adapter.name)).toEqual(['telegram', 'slack'])
  })
})
