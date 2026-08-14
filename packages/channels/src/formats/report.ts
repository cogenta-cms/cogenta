import { CogentaError } from '@cogenta/core'
import type { ChannelKeyFigure, ChannelMessageSection, ReportChannelMessage } from '../adapter.js'
import { REPORT_SCREEN_BUDGET_CHARS, reportBodyLength } from './budget.js'

export interface BuildReportInput {
  readonly title: string
  readonly keyFigures: readonly ChannelKeyFigure[]
  readonly sections: readonly ChannelMessageSection[]
  readonly moreUrl?: string
}

/**
 * "Rapport — synthèse périodique. Structure fixe, chiffres clés en tête,
 * détail ensuite, jamais plus d'un écran sans repli." A report with no key
 * figure isn't a synthesis, it's a dump; a report over the screen budget
 * with nowhere to send the reader for detail is exactly the failure mode
 * the lot's own words warn against ("un message qui ne rentre pas dans un
 * écran de téléphone est un message qui ne sera pas lu") — both are refused
 * here rather than left to whichever channel adapter happens to render it.
 */
export function buildReport(input: BuildReportInput): ReportChannelMessage {
  if (input.title.trim().length === 0) {
    throw new CogentaError({
      code: 'CHANNEL_MESSAGE_INVALID',
      message: 'A report message must have a non-empty title.',
      hint: 'Give the report a real title before dispatching it.',
    })
  }
  if (input.keyFigures.length === 0) {
    throw new CogentaError({
      code: 'CHANNEL_MESSAGE_INVALID',
      message: 'A report message must carry at least one key figure.',
      hint: '"Chiffres clés en tête" is not optional — summarise the period with at least one number before the detail sections.',
    })
  }
  const bodyLength = reportBodyLength(input.sections)
  if (bodyLength > REPORT_SCREEN_BUDGET_CHARS && input.moreUrl === undefined) {
    throw new CogentaError({
      code: 'CHANNEL_MESSAGE_INVALID',
      message: `This report's detail is ${bodyLength} characters, over the ${REPORT_SCREEN_BUDGET_CHARS}-character screen budget, with no "moreUrl" fallback.`,
      hint: 'Either shorten the sections, or pass moreUrl pointing at the full detail in the admin — "jamais plus d\'un écran sans repli".',
      details: { bodyLength, budget: REPORT_SCREEN_BUDGET_CHARS },
    })
  }

  return {
    level: 'report',
    title: input.title,
    keyFigures: input.keyFigures,
    sections: input.sections,
    ...(input.moreUrl === undefined ? {} : { moreUrl: input.moreUrl }),
  }
}
