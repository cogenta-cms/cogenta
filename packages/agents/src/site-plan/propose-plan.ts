import { newId } from '@cogenta/schema'
import type { ExtractedDocument } from '../documents/extract-text.js'
import type { ProviderClient } from '../providers/types.js'
import { analyseBrief } from './analyse-brief.js'
import { proposeContentModel } from './content-model.js'
import { proposeDemoContent } from './demo-content.js'
import {
  EMPTY_EXISTING_SITE,
  type ExistingSiteSnapshot,
  isExistingSiteEmpty,
} from './site-context.js'
import { generateSkinCandidates } from './skin-candidates.js'
import { detectStructuralGaps } from './structural-gaps.js'
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
  /**
   * Fiche 60 — the site this plan would join, when there already is one.
   * Absent, or an empty snapshot, on a fresh install: the installer's own
   * entry point never builds one, so this fiche leaves it byte-for-byte
   * unchanged (R2/non-regression is the same guarantee here as everywhere
   * else — nothing in this pipeline behaves differently just because a
   * caller chose not to supply site context).
   */
  readonly existingSite?: ExistingSiteSnapshot
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
  const existingSite = options.existingSite ?? EMPTY_EXISTING_SITE

  const analysed = await analyseBrief({
    client: options.client,
    model: options.model,
    documents: options.documents,
    ...(options.siteName === undefined ? {} : { siteName: options.siteName }),
    ...(options.existingSite === undefined ? {} : { existingSite: options.existingSite }),
  })
  if (!analysed.ok) return { ok: false, stage: 'brief', reason: analysed.reason }
  const brief = analysed.brief

  const skinDescription = [
    brief.activity,
    `Audience: ${brief.audience}.`,
    `Tone: ${brief.tone}.`,
  ].join(' ')

  const [model, skins] = await Promise.all([
    proposeContentModel({
      client: options.client,
      model: options.model,
      brief,
      ...(options.existingSite === undefined ? {} : { existingSite: options.existingSite }),
    }),
    generateSkinCandidates({
      client: options.client,
      model: options.model,
      description: skinDescription,
      blueprintLabel: options.blueprintLabel ?? brief.activity,
      ...(options.skinCount === undefined ? {} : { count: options.skinCount }),
      ...(options.existingSite === undefined ? {} : { existingSite: options.existingSite }),
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

  // Fiche 60's own non-regression bar: "l'installeur (site neuf) se comporte
  // exactement comme avant cette fiche." A fresh install never supplies
  // `existingSite`, so this pass — which the fiche frames throughout as
  // comparing the plan against a site that already exists — stays silent
  // for it, the same "premier jet" gate task 4 uses for its own prompt.
  const structuralGaps = isExistingSiteEmpty(existingSite)
    ? []
    : detectStructuralGaps({
        proposedPages: model.pages,
        existingSite,
        ...(brief.languages[0] === undefined ? {} : { locale: brief.languages[0] }),
      })

  const warnings = [
    ...brief.warnings,
    ...skins.failures.map(
      (failure) => `The "${failure.label}" design was not offered: ${failure.reason}.`,
    ),
    ...model.skippedExisting.map(
      (skipped) => `A collection named "${skipped.name}" was not proposed: ${skipped.reason}.`,
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
      structuralGaps,
      warnings,
    },
  }
}
