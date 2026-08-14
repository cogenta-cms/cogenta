import { describe, expect, it } from 'vitest'
import { verifyApprovalLinkSignature } from '../../../src/approvals/signed-link.js'
import { buildAlert } from '../../../src/formats/alert.js'
import { buildNotification } from '../../../src/formats/notification.js'
import { buildReport } from '../../../src/formats/report.js'
import { renderWebhookPayload } from '../../../src/providers/webhook/render.js'

const LINKS = {
  baseUrl: 'https://example.com/approve',
  signingKey: 'secret',
  expiresInSeconds: 1200,
}

describe('renderWebhookPayload', () => {
  it('renders a notification as a plain, actionless payload', () => {
    const message = buildNotification('Le déploiement a réussi.')

    const payload = renderWebhookPayload(message)

    expect(payload).toEqual({
      level: 'notification',
      title: 'Le déploiement a réussi.',
      text: 'Le déploiement a réussi.',
    })
    expect(payload.actions).toBeUndefined()
  })

  it('renders a report with its key figures and detail', () => {
    const message = buildReport({
      title: 'Scan de dépendances',
      keyFigures: [{ label: 'Constats', value: '15' }],
      sections: [{ body: 'Détail des 15 constats.' }],
    })

    const payload = renderWebhookPayload(message)

    expect(payload.level).toBe('report')
    expect(payload.title).toBe('Scan de dépendances')
    expect(payload.text).toContain('Constats : 15')
    expect(payload.text).toContain('Détail des 15 constats.')
  })

  it('renders approve/deny actions as real, independently-verifiable signed links', () => {
    const message = buildAlert({
      title: 'Approbation requise',
      severity: 'warning',
      context: 'Un agent souhaite exécuter un outil.',
      expectedAction: 'Approuver ou refuser.',
      adminUrl: 'https://admin.example.com/approvals/1',
      actions: [
        { id: 'approve TOKEN123', label: 'Approuver' },
        { id: 'deny TOKEN456', label: 'Refuser' },
      ],
    })

    const payload = renderWebhookPayload(message, LINKS)

    expect(payload.actions).toHaveLength(2)
    const approve = payload.actions?.[0]
    const deny = payload.actions?.[1]
    expect(approve?.label).toBe('Approuver')
    expect(deny?.label).toBe('Refuser')

    const approveUrl = new URL(approve?.url ?? '')
    expect(approveUrl.searchParams.get('token')).toBe('TOKEN123')
    expect(approveUrl.searchParams.get('decision')).toBe('approved')
    expect(
      verifyApprovalLinkSignature(
        LINKS.signingKey,
        'TOKEN123',
        'approved',
        Number(approveUrl.searchParams.get('expires')),
        approveUrl.searchParams.get('signature') ?? '',
      ),
    ).toBe(true)
  })

  it('never carries channel-specific formatting artifacts (no Markdown, no Block Kit)', () => {
    const message = buildAlert({
      title: 'Alerte',
      severity: 'critical',
      context: 'Contexte.',
      expectedAction: 'Agir.',
      adminUrl: 'https://admin.example.com/x',
    })

    const payload = renderWebhookPayload(message)
    const serialised = JSON.stringify(payload)

    expect(serialised).not.toContain('parse_mode')
    expect(serialised).not.toContain('callback_data')
    expect(serialised).not.toContain('block_id')
    expect(serialised).not.toContain('*')
  })
})
