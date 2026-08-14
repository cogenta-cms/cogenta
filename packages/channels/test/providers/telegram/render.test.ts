import { describe, expect, it } from 'vitest'
import type { ChannelMessage } from '../../../src/adapter.js'
import { escapeMarkdownV2, renderTelegramMessage } from '../../../src/providers/telegram/render.js'

describe('escapeMarkdownV2', () => {
  it('escapes every MarkdownV2 special character', () => {
    expect(escapeMarkdownV2('a.b!c-d_e*f')).toBe('a\\.b\\!c\\-d\\_e\\*f')
  })
})

describe('renderTelegramMessage', () => {
  it('renders a notification as one escaped line, no title, no buttons', () => {
    const message: ChannelMessage = { level: 'notification', text: 'Build finished.' }
    const rendered = renderTelegramMessage(message)
    expect(rendered.text).toBe('Build finished\\.')
    expect(rendered.replyMarkup).toBeUndefined()
  })

  it('renders an alert with severity, context, expected action, admin link and buttons', () => {
    const message: ChannelMessage = {
      level: 'alert',
      title: 'Deps scan found a critical CVE',
      severity: 'critical',
      context: 'A dependency has a known exploit.',
      expectedAction: 'Approve the patch PR.',
      adminUrl: 'https://admin.example/agents/security',
      actions: [
        { id: '/approve 42', label: 'Approuver' },
        { id: '/deny 42', label: 'Refuser' },
      ],
    }
    const rendered = renderTelegramMessage(message)
    expect(rendered.text).toContain('🔴')
    expect(rendered.text).toContain('Deps scan found a critical CVE')
    expect(rendered.text).toContain('known exploit')
    expect(rendered.replyMarkup).toEqual({
      inline_keyboard: [
        [
          { text: 'Approuver', callback_data: '/approve 42' },
          { text: 'Refuser', callback_data: '/deny 42' },
        ],
      ],
    })
  })

  it('renders a report with key figures first, then sections, then the fallback link', () => {
    const message: ChannelMessage = {
      level: 'report',
      title: 'Weekly SEO audit',
      keyFigures: [{ label: 'issues found', value: '3' }],
      sections: [{ heading: 'Broken links', body: '2 internal links return 404.' }],
      moreUrl: 'https://admin.example/reports/seo/42',
    }
    const rendered = renderTelegramMessage(message)
    expect(rendered.text).toContain('Weekly SEO audit')
    expect(rendered.text).toContain('3')
    expect(rendered.text).toContain('Broken links')
    expect(rendered.text).toContain('admin.example')
    expect(rendered.replyMarkup).toBeUndefined()
  })
})
