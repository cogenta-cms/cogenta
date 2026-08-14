import { describe, expect, it } from 'vitest'
import type {
  AlertChannelMessage,
  ChannelIdentity,
  InboundCommand,
  NotificationChannelMessage,
  ReportChannelMessage,
} from '../src/adapter.js'

describe('ChannelMessage', () => {
  it('represents an alert with title, severity, one-sentence context, an expected action and an admin link', () => {
    const message: AlertChannelMessage = {
      level: 'alert',
      title: 'Dependency scan found a critical vulnerability',
      severity: 'critical',
      context: 'lodash 4.17.15 is affected by a known prototype-pollution CVE.',
      expectedAction: 'Review and approve the proposed dependency bump.',
      adminUrl: 'https://example.test/admin/security/scan-42',
      actions: [
        { id: 'approve-42', label: 'Approuver' },
        { id: 'refuse-42', label: 'Refuser' },
      ],
    }
    expect(message.level).toBe('alert')
    expect(message.actions).toHaveLength(2)
  })

  it('represents a report with key figures first and detail sections after, with an optional fallback link', () => {
    const message: ReportChannelMessage = {
      level: 'report',
      title: 'Rapport hebdomadaire SEO',
      keyFigures: [
        { label: 'Pages auditées', value: '128' },
        { label: 'Problèmes trouvés', value: '3' },
      ],
      sections: [{ heading: 'Détail', body: '3 pages ont un texte alternatif manquant.' }],
      moreUrl: 'https://example.test/admin/seo/reports/2026-08-14',
    }
    expect(message.keyFigures[0]?.label).toBe('Pages auditées')
  })

  it('represents a notification as one line, with no title, sections or actions at the type level', () => {
    const message: NotificationChannelMessage = { level: 'notification', text: 'Backup complete.' }
    expect(message).toEqual({ level: 'notification', text: 'Backup complete.' })
  })
})

describe('ChannelIdentity', () => {
  it('represents an unlinked channel identity distinctly from a linked one', () => {
    const unlinked: ChannelIdentity = {
      channelName: 'telegram',
      channelUserId: '123456',
      linkedUserId: null,
    }
    const linked: ChannelIdentity = {
      channelName: 'telegram',
      channelUserId: '123456',
      linkedUserId: 'user-abc',
    }
    expect(unlinked.linkedUserId).toBeNull()
    expect(linked.linkedUserId).toBe('user-abc')
  })
})

describe('InboundCommand', () => {
  it('always carries the identity it came from, so a command cannot be handled without knowing who sent it', () => {
    const command: InboundCommand = {
      text: '/approve 42',
      identity: { channelName: 'telegram', channelUserId: '123456', linkedUserId: null },
    }
    expect(command.identity.linkedUserId).toBeNull()
  })
})
