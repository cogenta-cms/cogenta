import { newId } from '@cogenta/schema'
import type { ExtractedDocument } from '../documents/extract-text.js'
import type { ProviderClient } from '../providers/types.js'
import { analyseBrief } from './analyse-brief.js'
import { proposeContentModel } from './content-model.js'
import { proposeDemoContent } from './demo-content.js'
import { generateSkinCandidates } from './skin-candidates.js'
import type { SitePlanDraft } from './types.js'

/**
 * The four agents of L19, run in order, producing one draft.
 *
 * The order is a real dependency chain, not a convention: the content model
 * needs the brief, the demo content needs the accepted field shapes, and the
 * skins need only the brief — which is why the skins are generated alongside
 * the content model rather than after it.
 *
 * A failure at any stage is reported by stage rather than swallowed. Half a
 * plan is worse than none: an installer that shows a content model with no
 * design choice, or a design choice with no content model, has to say which
 * half is missing and why.
 *
 * Nothing here writes anything. `SitePlanDraft` is a proposal; turning any
 * part of it into a real site goes through `summarisePlan` /
 * `resolveApprovedPlan` and a human first.
 */

export type PlanStage = 'brief' | 'contentModel' | 'skins' | 'demoContent'

export interface ProposeSitePlanOptions {
  readonly client: ProviderClient
  readonly model: string
  readonly documents: readonly ExtractedDocument[]
  readonly siteName?: string
  /** Between 2 and 5. Defaults to 3. */
  readonly skinCount?: number
  /** Shown to the skin generator as the site's kind — the blueprint label when there is one. */
  readonly blueprintLabel?: string
  readonly now?: () => Date
  readonly idFactory?: () => string
}

export type ProposeSitePlanResult =
  | { readonly ok: true; readonly draft: SitePlanDraft }
  | { readonly ok: false; readonly stage: PlanStage; readonly reason: string }

export async function proposeSitePlan(
  options: ProposeSitePlanOptions,
): Promise<ProposeSitePlanResult> {
  const now = options.now ?? (() => new Date())
  const newDraftId = options.idFactory ?? newId

  const analysed = await analyseBrief({
    client: options.client,
    model: options.model,
    documents: options.documents,
    ...(options.siteName === undefined ? {} : { siteName: options.siteName }),
  })
  if (!analysed.ok) return { ok: false, stage: 'brief', reason: analysed.reason }
  const brief = analysed.brief

  const skinDescription = [
    brief.activity,
    `Audience: ${brief.audience}.`,
    `Tone: ${brief.tone}.`,
  ].join(' ')

  const [model, skins] = await Promise.all([
    proposeContentModel({ client: options.client, model: options.model, brief }),
    generateSkinCandidates({
      client: options.client,
      model: options.model,
      description: skinDescription,
      blueprintLabel: options.blueprintLabel ?? brief.activity,
      ...(options.skinCount === undefined ? {} : { count: options.skinCount }),
    }),
  ])

  if (!model.ok) return { ok: false, stage: 'contentModel', reason: model.reason }
  if (!skins.ok) return { ok: false, stage: 'skins', reason: skins.reason }

  const demo = await proposeDemoContent({
    client: options.client,
    model: options.model,
    brief,
    contentModel: model.proposal,
  })

  const warnings = [
    ...brief.warnings,
    ...skins.failures.map(
      (failure) => `The "${failure.label}" design was not offered: ${failure.reason}.`,
    ),
    ...(demo.ok
      ? demo.rejected.map(
          (rejection) =>
            `A demonstration entry for "${rejection.collection}" was dropped: ${rejection.reason}.`,
        )
      : [`No demonstration content was proposed: ${demo.reason}.`]),
  ]

  return {
    ok: true,
    draft: {
      id: newDraftId(),
      createdAt: now().toISOString(),
      brief,
      contentModel: model.proposal,
      pages: model.pages,
      skins: skins.candidates,
      demoContent: demo.ok ? demo.entries : [],
      violations: model.violations,
      warnings,
    },
  }
}
