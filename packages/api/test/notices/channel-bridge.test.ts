import type { NotificationDispatcher, NotifyInput } from '@cogenta/channels'
import { describe, expect, it } from 'vitest'
import { createNoticeChannelBridge, toChannelSeverity } from '../../src/notices/channel-bridge.js'
import type { NoticeHistoryEntry } from '../../src/notices/history.js'

function entry(overrides: Partial<NoticeHistoryEntry> = {}): NoticeHistoryEntry {
  return {
    id: 'row-1',
    noticeId: 'demo',
    code: 'demo',
    severity: 'warning',
    params: {},
    actionCode: null,
    actionHref: null,
    dismissible: true,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: null,
    readAt: null,
    ...overrides,
  }
}

function fakeDispatcher(): { dispatcher: NotificationDispatcher; calls: NotifyInput[] } {
  const calls: NotifyInput[] = []
  const dispatcher: NotificationDispatcher = {
    notify: async (input) => {
      calls.push(input)
      return { dispatched: true, messageId: 'msg-1' }
    },
    flushDue: async () => [],
  }
  return { dispatcher, calls }
}

describe('toChannelSeverity', () => {
  it('maps danger to critical, the one severity quiet hours never defer', () => {
    expect(toChannelSeverity('danger')).toBe('critical')
  })

  it('maps warning to warning', () => {
    expect(toChannelSeverity('warning')).toBe('warning')
  })

  it('folds info and success both into info', () => {
    expect(toChannelSeverity('info')).toBe('info')
    expect(toChannelSeverity('success')).toBe('info')
  })
})

describe('createNoticeChannelBridge', () => {
  it('does nothing when nothing changed', async () => {
    const { dispatcher, calls } = fakeDispatcher()
    const bridge = createNoticeChannelBridge({
      dispatcher,
      linkedChannelNames: async () => ['telegram'],
      render: () => ({ title: 't', summary: 's' }),
    })

    await bridge.notifyNew('user-1', [])
    expect(calls).toEqual([])
  })

  it('does nothing when the person has no linked channel', async () => {
    const { dispatcher, calls } = fakeDispatcher()
    const bridge = createNoticeChannelBridge({
      dispatcher,
      linkedChannelNames: async () => [],
      render: () => ({ title: 't', summary: 's' }),
    })

    await bridge.notifyNew('user-1', [entry()])
    expect(calls).toEqual([])
  })

  it('notifies every linked channel for every changed entry', async () => {
    const { dispatcher, calls } = fakeDispatcher()
    const bridge = createNoticeChannelBridge({
      dispatcher,
      linkedChannelNames: async () => ['telegram', 'slack'],
      render: (e) => ({ title: e.code, summary: 'body' }),
    })

    await bridge.notifyNew('user-1', [entry({ severity: 'danger' })])

    expect(calls).toHaveLength(2)
    expect(calls.map((c) => c.channelName).sort()).toEqual(['slack', 'telegram'])
    expect(calls[0]).toMatchObject({
      userId: 'user-1',
      eventType: 'admin-notice',
      severity: 'critical',
      title: 'demo',
      summary: 'body',
    })
  })

  it('never throws when the dispatcher rejects — a channel failure must not break the notices response', async () => {
    const dispatcher: NotificationDispatcher = {
      notify: async () => {
        throw new Error('channel is down')
      },
      flushDue: async () => [],
    }
    const bridge = createNoticeChannelBridge({
      dispatcher,
      linkedChannelNames: async () => ['telegram'],
      render: () => ({ title: 't', summary: 's' }),
    })

    await expect(bridge.notifyNew('user-1', [entry()])).resolves.toBeUndefined()
  })

  it('never throws when resolving linked channels itself fails', async () => {
    const { dispatcher, calls } = fakeDispatcher()
    const bridge = createNoticeChannelBridge({
      dispatcher,
      linkedChannelNames: async () => {
        throw new Error('db down')
      },
      render: () => ({ title: 't', summary: 's' }),
    })

    await expect(bridge.notifyNew('user-1', [entry()])).resolves.toBeUndefined()
    expect(calls).toEqual([])
  })
})
