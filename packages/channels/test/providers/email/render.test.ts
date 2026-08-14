import { describe, expect, it } from 'vitest'
import { buildAlert } from '../../../src/formats/alert.js'
import { buildNotification } from '../../../src/formats/notification.js'
import { buildReport } from '../../../src/formats/report.js'
import { renderEmailMessage } from '../../../src/providers/email/render.js'

const LINKS = {
  baseUrl: 'https://example.com/approve',
  signingKey: 'secret',
  expiresInSeconds: 1200,
}

describe('renderEmailMessage', () => {
  it('renders an alert with severity in the subject, context, expected action and admin link', () => {
    const message = buildAlert({
      title: 'Dependency vulnerability',
      severity: 'critical',
      context: 'A critical CVE was found.',
      expectedAction: 'Review the patch PR.',
      adminUrl: 'https://admin.example.com/security/1',
    })

    const rendered = renderEmailMessage(message)

    expect(rendered.subject).toBe('[CRITICAL] Dependency vulnerability')
    expect(rendered.text).toContain('A critical CVE was found.')
    expect(rendered.text).toContain('Review the patch PR.')
    expect(rendered.text).toContain('https://admin.example.com/security/1')
    expect(rendered.html).toContain('A critical CVE was found.')
  })

  it('renders approve/deny actions as signed links, not buttons', () => {
    const message = buildAlert({
      title: 'Approval needed',
      severity: 'warning',
      context: 'An agent wants to run a tool.',
      expectedAction: 'Approve or deny.',
      adminUrl: 'https://admin.example.com/approvals/1',
      actions: [
        { id: 'approve TOKEN123', label: 'Approuver' },
        { id: 'deny TOKEN456', label: 'Refuser' },
      ],
    })

    const rendered = renderEmailMessage(message, LINKS)

    expect(rendered.text).toContain('Approuver : https://example.com/approve?')
    expect(rendered.text).toContain('token=TOKEN123')
    expect(rendered.text).toContain('decision=approved')
    expect(rendered.text).toContain('Refuser : https://example.com/approve?')
    expect(rendered.text).toContain('token=TOKEN456')
    expect(rendered.text).toContain('decision=rejected')
    expect(rendered.html).toContain('<a href=')
  })

  it('throws when a message has actions but no actionLinks were configured', () => {
    const message = buildAlert({
      title: 'Approval needed',
      severity: 'warning',
      context: 'ctx',
      expectedAction: 'act',
      adminUrl: 'https://admin.example.com/1',
      actions: [{ id: 'approve TOKEN', label: 'Approuver' }],
    })

    expect(() => renderEmailMessage(message)).toThrowError(/actionLinks/)
  })

  it('throws on an action id that is not the approve/deny command shape', () => {
    const message = buildAlert({
      title: 'Weird action',
      severity: 'info',
      context: 'ctx',
      expectedAction: 'act',
      adminUrl: 'https://admin.example.com/1',
      actions: [{ id: 'snooze SOMEID', label: 'Snooze' }],
    })

    expect(() => renderEmailMessage(message, LINKS)).toThrowError(/approve <token>/)
  })

  it('renders a report with key figures first and a "voir plus" link when present', () => {
    const message = buildReport({
      title: 'Weekly security scan',
      keyFigures: [{ label: 'Findings', value: '15' }],
      sections: [{ heading: 'Critical', body: 'One critical CVE.' }],
      moreUrl: 'https://admin.example.com/reports/1',
    })

    const rendered = renderEmailMessage(message)

    expect(rendered.subject).toBe('Weekly security scan')
    expect(rendered.text).toContain('Findings : 15')
    expect(rendered.text).toContain('Critical')
    expect(rendered.text).toContain('One critical CVE.')
    expect(rendered.text).toContain('https://admin.example.com/reports/1')
    expect(rendered.html).toContain('Voir plus')
  })

  it('renders a notification as a single-line subject and body', () => {
    const message = buildNotification('Site deployed successfully.')

    const rendered = renderEmailMessage(message)

    expect(rendered.subject).toBe('Site deployed successfully.')
    expect(rendered.text).toBe('Site deployed successfully.')
    expect(rendered.html).toBe('<p>Site deployed successfully.</p>')
  })

  it('escapes HTML-significant characters in rendered content', () => {
    const message = buildNotification('<script>alert(1)</script> & "quoted"')

    const rendered = renderEmailMessage(message)

    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).toContain('&lt;script&gt;')
    expect(rendered.html).toContain('&amp;')
    expect(rendered.html).toContain('&quot;quoted&quot;')
  })
})
