import {
  type ApprovedPlan,
  type ExtractedDocument,
  type PlanDecisions,
  type PlanItemDecision,
  type ProviderClient,
  proposeSitePlan,
  resolveApprovedPlan,
  type SitePlanDraft,
  summarisePlan,
} from '@cogenta/agents'
import type { Output } from '@cogenta/cli'
import type { Prompter } from './prompts.js'

/**
 * L19 task 5, in the installer: the plan presented for review, section by
 * section, item by item.
 *
 * The loop below is the whole point, so it is worth saying what it does not
 * do: it never asks "accept everything?", and it cannot, because
 * `resolveApprovedPlan` refuses a plan with an undecided item. Every
 * collection, every page, every demonstration entry and every constraint
 * read out of the document is a question of its own, with what it means
 * printed under it. The designs are the one exception in shape, not in
 * spirit: they are alternatives, so they are one question with several
 * answers.
 *
 * In a non-interactive run (`--yes`, `--config`), `Prompter.confirm` returns
 * its default — which is `false` here, deliberately. That produces an
 * approved plan that is empty, not a plan silently applied: the draft is
 * saved instead, and waits for a human. The lot is explicit about this
 * ("soit l'étape de document est simplement absente du flux non interactif,
 * soit elle produit un brouillon qui attend d'être validé").
 */

export interface RunPlanFlowOptions {
  readonly prompter: Prompter
  readonly out: Output
  readonly client: ProviderClient
  readonly model: string
  readonly documents: readonly ExtractedDocument[]
  readonly siteName?: string
  readonly blueprintLabel?: string
  readonly skinCount?: number
}

export type PlanFlowOutcome =
  | {
      readonly kind: 'reviewed'
      readonly draft: SitePlanDraft
      readonly decisions: PlanDecisions
      readonly approved: ApprovedPlan
    }
  /** A plan was produced but nobody reviewed it — it is saved, never applied. */
  | { readonly kind: 'deferred'; readonly draft: SitePlanDraft; readonly reason: string }
  | { readonly kind: 'failed'; readonly stage: string; readonly reason: string }

function printBrief(draft: SitePlanDraft, out: Output): void {
  out.heading('What we understood from your document')
  out.line(draft.brief.summary)
  out.detail(`Activity: ${draft.brief.activity}`)
  out.detail(`Audience: ${draft.brief.audience}`)
  out.detail(`Tone: ${draft.brief.tone}`)
  out.detail(`Languages: ${draft.brief.languages.join(', ')}`)
  for (const source of draft.brief.sources) {
    out.detail(
      `Read from ${source.filename} (${source.format}, ${source.characters} characters${source.truncated ? ', truncated' : ''})`,
    )
  }
  for (const warning of draft.brief.warnings) out.warn(warning)
  for (const violation of draft.violations) out.warn(violation.explanation)
}

export async function runPlanFlow(options: RunPlanFlowOptions): Promise<PlanFlowOutcome> {
  options.out.heading('Reading your document')
  options.out.detail('Analysing the brief, proposing a content model and several designs…')

  const proposed = await proposeSitePlan({
    client: options.client,
    model: options.model,
    documents: options.documents,
    ...(options.siteName === undefined ? {} : { siteName: options.siteName }),
    ...(options.blueprintLabel === undefined ? {} : { blueprintLabel: options.blueprintLabel }),
    ...(options.skinCount === undefined ? {} : { skinCount: options.skinCount }),
  })

  if (!proposed.ok) {
    options.out.bad(
      `The document could not be turned into a plan (${proposed.stage}): ${proposed.reason}`,
    )
    return { kind: 'failed', stage: proposed.stage, reason: proposed.reason }
  }

  const { draft } = proposed
  printBrief(draft, options.out)
  for (const warning of draft.warnings) options.out.warn(warning)

  const wantsReview = await options.prompter.confirm(
    'Review this proposal now, item by item? (answering no saves it as a draft to review in the admin later — nothing is applied either way)',
    false,
  )
  if (!wantsReview) {
    return {
      kind: 'deferred',
      draft,
      reason: 'the proposal was not reviewed, so it was saved as a draft instead of being applied',
    }
  }

  const decisions: Record<string, PlanItemDecision> = {}
  for (const section of summarisePlan(draft)) {
    if (section.items.length === 0) continue
    options.out.heading(section.title)
    options.out.line(section.description)

    if (section.mode === 'one-of') {
      const chosen = await options.prompter.choice<string | null>(
        'Which one?',
        [
          ...section.items.map((item) => ({
            label: item.title,
            value: item.id,
            hint: item.detail,
          })),
          { label: 'None of them', value: null },
        ],
        0,
      )
      for (const item of section.items) {
        decisions[item.id] = item.id === chosen ? 'accepted' : 'rejected'
      }
      continue
    }

    for (const item of section.items) {
      options.out.detail(item.detail)
      const keep = await options.prompter.confirm(`Keep “${item.title}”?`, true)
      decisions[item.id] = keep ? 'accepted' : 'rejected'
    }
  }

  const approved = resolveApprovedPlan(draft, decisions)
  options.out.ok(
    `Approved: ${approved.collections.length} collection(s), ${approved.pages.length} page(s), ${approved.demoContent.length} demonstration entr${approved.demoContent.length === 1 ? 'y' : 'ies'}${approved.skinId === undefined ? ', no design' : `, the “${approved.skinId}” design`}.`,
  )
  if (approved.rejected.length > 0) {
    options.out.detail(`Refused: ${approved.rejected.join(', ')}.`)
  }

  return { kind: 'reviewed', draft, decisions, approved }
}
