import { describe, expect, it } from 'vitest'
import { buildAlert } from '../../../src/formats/alert.js'
import { buildNotification } from '../../../src/formats/notification.js'
import { buildReport } from '../../../src/formats/report.js'
import { renderSlackMessage } from '../../../src/providers/slack/render.js'

describe('renderSlackMessage', () => {
  it('renders a notification as text with no blocks', () => {
    const rendered = renderSlackMessage(buildNotification('Deployed.'))
    expect(rendered.text).toBe('Deployed.')
    expect(rendered.blocks).toEqual([])
  })

  it('renders an alert as sections plus an actions block for its buttons', () => {
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

    const rendered = renderSlackMessage(message)

    const actionsBlock = rendered.blocks.find((block) => block.type === 'actions')
    expect(actionsBlock).toBeDefined()
    const elements = actionsBlock?.elements as readonly { value: string }[]
    expect(elements.map((element) => element.value)).toEqual(['approve TOKEN', 'deny TOKEN'])
  })

  it('renders an alert with no actions with no actions block', () => {
    const message = buildAlert({
      title: 'FYI',
      severity: 'info',
      context: 'ctx',
      expectedAction: 'act',
      adminUrl: 'https://admin.example.com/1',
    })

    const rendered = renderSlackMessage(message)

    expect(rendered.blocks.some((block) => block.type === 'actions')).toBe(false)
  })

  it('renders a report with key figures, sections and a "voir le détail" link', () => {
    const message = buildReport({
      title: 'Weekly scan',
      keyFigures: [{ label: 'Findings', value: '15' }],
      sections: [{ heading: 'Critical', body: 'One CVE.' }],
      moreUrl: 'https://admin.example.com/reports/1',
    })

    const rendered = renderSlackMessage(message)

    expect(rendered.blocks.some((block) => block.type === 'header')).toBe(true)
    const linkBlock = rendered.blocks.find(
      (block) =>
        block.type === 'section' &&
        (block.text as { text: string }).text.includes('admin.example.com/reports/1'),
    )
    expect(linkBlock).toBeDefined()
  })
})
