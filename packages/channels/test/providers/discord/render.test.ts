import { describe, expect, it } from 'vitest'
import { buildAlert } from '../../../src/formats/alert.js'
import { buildNotification } from '../../../src/formats/notification.js'
import { buildReport } from '../../../src/formats/report.js'
import { renderDiscordMessage } from '../../../src/providers/discord/render.js'

describe('renderDiscordMessage', () => {
  it('renders a notification as content with no embeds/components', () => {
    const rendered = renderDiscordMessage(buildNotification('Deployed.'))
    expect(rendered.content).toBe('Deployed.')
    expect(rendered.embeds).toEqual([])
    expect(rendered.components).toEqual([])
  })

  it('renders an alert as an embed plus an action row for its buttons', () => {
    const message = buildAlert({
      title: 'Approval needed',
      severity: 'warning',
      context: 'ctx',
      expectedAction: 'act',
      adminUrl: 'https://admin.example.com/1',
      actions: [
        { id: 'approve TOKEN', label: 'Approuver' },
        { id: 'deny TOKEN', label: 'Refuser' },
      ],
    })

    const rendered = renderDiscordMessage(message)

    expect(rendered.embeds[0]?.description).toBe('ctx')
    const row = rendered.components[0]
    expect(row?.type).toBe(1)
    expect(row?.components.map((component) => component.custom_id)).toEqual([
      'approve TOKEN',
      'deny TOKEN',
    ])
  })

  it('renders an alert with no actions with no components', () => {
    const message = buildAlert({
      title: 'FYI',
      severity: 'info',
      context: 'ctx',
      expectedAction: 'act',
      adminUrl: 'https://admin.example.com/1',
    })

    const rendered = renderDiscordMessage(message)

    expect(rendered.components).toEqual([])
  })

  it('renders a report with key figures as inline fields, sections, and a "voir le détail" link', () => {
    const message = buildReport({
      title: 'Weekly scan',
      keyFigures: [{ label: 'Findings', value: '15' }],
      sections: [{ heading: 'Critical', body: 'One CVE.' }],
      moreUrl: 'https://admin.example.com/reports/1',
    })

    const rendered = renderDiscordMessage(message)

    expect(rendered.embeds[0]?.title).toBe('Weekly scan')
    expect(rendered.embeds[0]?.fields).toEqual([
      { name: 'Findings', value: '15', inline: true },
      { name: 'Critical', value: 'One CVE.' },
    ])
    expect(rendered.embeds[0]?.description).toContain('admin.example.com/reports/1')
  })
})
