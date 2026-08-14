import { describe, expect, it } from 'vitest'
import type { ChannelAdapter, ChannelMessage, ChannelTarget, MessageId } from '../../src/adapter.js'
import { createChannelLinkStore } from '../../src/linking/store.js'
import { createNotificationDispatcher } from '../../src/preferences/dispatcher.js'
import { createPreferenceStore } from '../../src/preferences/store.js'
import { createChannelRegistry } from '../../src/registry.js'
import { testDb } from '../helpers/db.js'

function fakeAdapter(name: string): ChannelAdapter & { readonly sent: ChannelMessage[] } {
  const sent: ChannelMessage[] = []
  return {
    name,
    capabilities: {
      richText: true,
      buttons: true,
      threads: false,
      attachments: false,
      inbound: true,
    },
    sent,
    async send(_target: ChannelTarget, message: ChannelMessage): Promise<MessageId> {
      sent.push(message)
      return `msg-${sent.length}`
    },
    async verifyIdentity() {
      throw new Error('not used in this test')
    },
  }
}

async function setup(now: () => number) {
  const db = await testDb()
  const linkStore = createChannelLinkStore(db, now)
  const preferenceStore = createPreferenceStore(db, now)
  const adapter = fakeAdapter('telegram')
  const registry = createChannelRegistry([adapter])

  const generated = await linkStore.generateCode('user-1', 'telegram')
  await linkStore.verifyCode(generated.code, 'telegram', 'chat-1')

  const dispatcher = createNotificationDispatcher({
    db,
    registry,
    linkStore,
    preferenceStore,
    buildAdminUrl: (userId, channelName) => `https://admin.example/${userId}/${channelName}`,
    now,
  })

  return { dispatcher, preferenceStore, adapter }
}

describe('createNotificationDispatcher', () => {
  it('sends immediately when grouping is "immediate" and preferences allow it', async () => {
    const clock = Date.UTC(2026, 0, 1, 12, 0, 0)
    const { dispatcher, adapter } = await setup(() => clock)

    const outcome = await dispatcher.notify({
      userId: 'user-1',
      channelName: 'telegram',
      eventType: 'security-alert',
      severity: 'warning',
      title: 'Dépendance vulnérable',
      summary: 'lodash@4.17.15',
    })

    expect(outcome).toEqual({ dispatched: true, messageId: 'msg-1' })
    expect(adapter.sent).toHaveLength(1)
  })

  it('filters an event type the user did not opt into', async () => {
    const clock = Date.UTC(2026, 0, 1, 12, 0, 0)
    const { dispatcher, preferenceStore, adapter } = await setup(() => clock)
    await preferenceStore.set('user-1', 'telegram', {
      eventTypes: ['seo-report'],
      minSeverity: 'info',
      quietHours: null,
      grouping: 'immediate',
    })

    const outcome = await dispatcher.notify({
      userId: 'user-1',
      channelName: 'telegram',
      eventType: 'security-alert',
      severity: 'critical',
      title: 'x',
      summary: 'y',
    })

    expect(outcome).toEqual({ dispatched: false, reason: 'not-subscribed' })
    expect(adapter.sent).toHaveLength(0)
  })

  it('filters a notification below the minimum severity', async () => {
    const clock = Date.UTC(2026, 0, 1, 12, 0, 0)
    const { dispatcher, preferenceStore, adapter } = await setup(() => clock)
    await preferenceStore.set('user-1', 'telegram', {
      eventTypes: ['security-alert'],
      minSeverity: 'critical',
      quietHours: null,
      grouping: 'immediate',
    })

    const outcome = await dispatcher.notify({
      userId: 'user-1',
      channelName: 'telegram',
      eventType: 'security-alert',
      severity: 'warning',
      title: 'x',
      summary: 'y',
    })

    expect(outcome).toEqual({ dispatched: false, reason: 'below-severity-threshold' })
    expect(adapter.sent).toHaveLength(0)
  })

  it('collapses fifteen queued notifications into exactly one grouped message on flush (hourly)', async () => {
    let clock = Date.UTC(2026, 0, 1, 12, 0, 0)
    const { dispatcher, preferenceStore, adapter } = await setup(() => clock)
    await preferenceStore.set('user-1', 'telegram', {
      eventTypes: ['security-alert'],
      minSeverity: 'info',
      quietHours: null,
      grouping: 'hourly',
    })

    for (let i = 0; i < 15; i++) {
      const outcome = await dispatcher.notify({
        userId: 'user-1',
        channelName: 'telegram',
        eventType: 'security-alert',
        severity: 'warning',
        title: `Constat ${i}`,
        summary: 'détail',
      })
      expect(outcome).toEqual({ dispatched: false, reason: 'queued-for-grouping' })
    }
    expect(adapter.sent).toHaveLength(0) // nothing sent yet — still queued

    // Before the hourly window elapses, a flush does nothing.
    let sent = await dispatcher.flushDue()
    expect(sent).toHaveLength(0)
    expect(adapter.sent).toHaveLength(0)

    // The window elapses.
    clock += 61 * 60 * 1000
    sent = await dispatcher.flushDue()

    expect(sent).toHaveLength(1)
    expect(adapter.sent).toHaveLength(1)
    expect(adapter.sent[0]?.level).toBe('report')

    // The queue is drained — a second flush sends nothing more.
    const secondFlush = await dispatcher.flushDue()
    expect(secondFlush).toHaveLength(0)
    expect(adapter.sent).toHaveLength(1)
  })

  it('defers a non-critical notification during quiet hours, and flushes it once the window ends', async () => {
    // 2026-01-01 is a Thursday; 23:00 UTC is inside a 22:00-07:00 quiet window.
    let clock = Date.UTC(2026, 0, 1, 23, 0, 0)
    const { dispatcher, preferenceStore, adapter } = await setup(() => clock)
    await preferenceStore.set('user-1', 'telegram', {
      eventTypes: ['security-alert'],
      minSeverity: 'info',
      quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 },
      grouping: 'immediate',
    })

    const outcome = await dispatcher.notify({
      userId: 'user-1',
      channelName: 'telegram',
      eventType: 'security-alert',
      severity: 'warning',
      title: 'x',
      summary: 'y',
    })
    expect(outcome).toEqual({ dispatched: false, reason: 'deferred-quiet-hours' })
    expect(adapter.sent).toHaveLength(0)

    // Still inside quiet hours — flush is a no-op.
    expect(await dispatcher.flushDue()).toHaveLength(0)

    // Quiet hours end at 07:00 the next day.
    clock = Date.UTC(2026, 0, 2, 7, 0, 0)
    const sent = await dispatcher.flushDue()

    expect(sent).toHaveLength(1)
    expect(adapter.sent).toHaveLength(1)
    expect(adapter.sent[0]?.level).toBe('notification') // a single deferred item, not a report
  })

  it('bypasses quiet hours for a critical notification', async () => {
    const clock = Date.UTC(2026, 0, 1, 23, 0, 0)
    const { dispatcher, preferenceStore, adapter } = await setup(() => clock)
    await preferenceStore.set('user-1', 'telegram', {
      eventTypes: ['security-alert'],
      minSeverity: 'info',
      quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 },
      grouping: 'immediate',
    })

    const outcome = await dispatcher.notify({
      userId: 'user-1',
      channelName: 'telegram',
      eventType: 'security-alert',
      severity: 'critical',
      title: 'x',
      summary: 'y',
    })

    expect(outcome).toEqual({ dispatched: true, messageId: 'msg-1' })
    expect(adapter.sent).toHaveLength(1)
  })

  it('reports "no-linked-channel" rather than throwing when the user has no link for that channel', async () => {
    const clock = Date.UTC(2026, 0, 1, 12, 0, 0)
    const { dispatcher, adapter } = await setup(() => clock)

    const outcome = await dispatcher.notify({
      userId: 'user-without-a-link',
      channelName: 'telegram',
      eventType: 'security-alert',
      severity: 'critical',
      title: 'x',
      summary: 'y',
    })

    expect(outcome).toEqual({ dispatched: false, reason: 'no-linked-channel' })
    expect(adapter.sent).toHaveLength(0)
  })

  it('keeps two channels for the same user independent', async () => {
    const clock = Date.UTC(2026, 0, 1, 12, 0, 0)
    const db = await testDb()
    const linkStore = createChannelLinkStore(db, () => clock)
    const preferenceStore = createPreferenceStore(db, () => clock)
    const telegram = fakeAdapter('telegram')
    const slack = fakeAdapter('slack')
    const registry = createChannelRegistry([telegram, slack])

    const telegramCode = await linkStore.generateCode('user-1', 'telegram')
    await linkStore.verifyCode(telegramCode.code, 'telegram', 'chat-1')
    const slackCode = await linkStore.generateCode('user-1', 'slack')
    await linkStore.verifyCode(slackCode.code, 'slack', 'slack-user-1')

    await preferenceStore.set('user-1', 'telegram', {
      eventTypes: ['security-alert'],
      minSeverity: 'info',
      quietHours: null,
      grouping: 'immediate',
    })
    await preferenceStore.set('user-1', 'slack', {
      eventTypes: ['security-alert'],
      minSeverity: 'info',
      quietHours: null,
      grouping: 'daily',
    })

    const dispatcher = createNotificationDispatcher({
      db,
      registry,
      linkStore,
      preferenceStore,
      buildAdminUrl: () => 'https://admin.example',
      now: () => clock,
    })

    const telegramOutcome = await dispatcher.notify({
      userId: 'user-1',
      channelName: 'telegram',
      eventType: 'security-alert',
      severity: 'warning',
      title: 'x',
      summary: 'y',
    })
    const slackOutcome = await dispatcher.notify({
      userId: 'user-1',
      channelName: 'slack',
      eventType: 'security-alert',
      severity: 'warning',
      title: 'x',
      summary: 'y',
    })

    expect(telegramOutcome).toEqual({ dispatched: true, messageId: 'msg-1' })
    expect(telegram.sent).toHaveLength(1)
    expect(slackOutcome).toEqual({ dispatched: false, reason: 'queued-for-grouping' })
    expect(slack.sent).toHaveLength(0)
  })
})
