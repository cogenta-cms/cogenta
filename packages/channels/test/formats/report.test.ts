import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { REPORT_SCREEN_BUDGET_CHARS } from '../../src/formats/budget.js'
import { buildReport } from '../../src/formats/report.js'

describe('buildReport', () => {
  it('builds a real ReportChannelMessage with key figures and sections', () => {
    const message = buildReport({
      title: 'Rapport SEO hebdomadaire',
      keyFigures: [{ label: 'pages auditées', value: '42' }],
      sections: [{ heading: 'Constats', body: 'Aucun problème critique.' }],
    })
    expect(message.level).toBe('report')
    expect(message.keyFigures).toHaveLength(1)
  })

  it('rejects an empty title', () => {
    expect(() =>
      buildReport({ title: '', keyFigures: [{ label: 'x', value: '1' }], sections: [] }),
    ).toThrow(CogentaError)
  })

  it('rejects a report with no key figure — "chiffres clés en tête" is not optional', () => {
    expect(() =>
      buildReport({ title: 'Rapport', keyFigures: [], sections: [{ body: 'Détail.' }] }),
    ).toThrow(CogentaError)
  })

  it('rejects a report over the screen budget with no moreUrl fallback', () => {
    const body = 'x'.repeat(REPORT_SCREEN_BUDGET_CHARS + 1)
    expect(() =>
      buildReport({
        title: 'Rapport',
        keyFigures: [{ label: 'x', value: '1' }],
        sections: [{ body }],
      }),
    ).toThrow(CogentaError)
  })

  it('accepts a report over the screen budget when moreUrl is provided', () => {
    const body = 'x'.repeat(REPORT_SCREEN_BUDGET_CHARS + 1)
    const message = buildReport({
      title: 'Rapport',
      keyFigures: [{ label: 'x', value: '1' }],
      sections: [{ body }],
      moreUrl: 'https://admin.example/reports/1',
    })
    expect(message.moreUrl).toBe('https://admin.example/reports/1')
  })

  it('accepts a report comfortably under the screen budget with no moreUrl', () => {
    const message = buildReport({
      title: 'Rapport court',
      keyFigures: [{ label: 'x', value: '1' }],
      sections: [{ body: 'Tout va bien.' }],
    })
    expect(message.moreUrl).toBeUndefined()
  })
})
