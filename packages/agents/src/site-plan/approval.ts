import { CogentaError } from '@cogenta/core'
import type { SkinTokens } from '@cogenta/render'
import { type CollectionDefinition, normalisePermissionRule } from '@cogenta/schema'
import type { DemoEntry, ProposedPage, SitePlanDraft } from './types.js'

/**
 * L19 task 5's rule, made structural: "validation section par section,
 * jamais une case « tout accepter » qui masque le détail."
 *
 * There is no "accept everything" here, and there cannot be one bolted on
 * later without changing this file: `resolveApprovedPlan` refuses unless
 * **every** item carries its own explicit decision, and refuses again if it
 * is handed a decision for an item that is not in the plan. A caller — a
 * CLI prompt loop, an admin screen, an API client — has to walk the items.
 * Whether the UI above it renders one screen or five is its business; what
 * it cannot do is skip an item.
 *
 * Nothing here applies anything. It turns a draft plus decisions into an
 * `ApprovedPlan`: the subset the human said yes to. Writing that subset to a
 * schema file, a database or a theme is the caller's separate, later act
 * (R6 — "rien n'est jamais appliqué automatiquement").
 */

export const PLAN_SECTIONS = ['brief', 'contentModel', 'pages', 'skin', 'demoContent'] as const
export type PlanSectionId = (typeof PLAN_SECTIONS)[number]

export type PlanItemDecision = 'accepted' | 'rejected'

export interface PlanItem {
  /** Stable within a draft: `section:key`. */
  readonly id: string
  readonly section: PlanSectionId
  readonly title: string
  /** Everything the human needs to judge it, in plain words. */
  readonly detail: string
}

export interface PlanSection {
  readonly id: PlanSectionId
  readonly title: string
  readonly description: string
  /** `'each'`: every item is judged on its own. `'one-of'`: exactly one item may be accepted. */
  readonly mode: 'each' | 'one-of'
  readonly items: readonly PlanItem[]
}

export type PlanDecisions = Readonly<Record<string, PlanItemDecision>>

export interface ApprovedPlan {
  readonly draftId: string
  readonly decidedAt: string
  readonly locales: readonly string[]
  /** Only the constraints the human confirmed. */
  readonly constraints: readonly { readonly quote: string; readonly source: string }[]
  readonly collections: readonly CollectionDefinition[]
  readonly pages: readonly ProposedPage[]
  readonly skinId?: string
  readonly skin?: SkinTokens
  readonly demoContent: readonly DemoEntry[]
  /** Item ids the human said no to — kept so a report can say what was refused, not only what was kept. */
  readonly rejected: readonly string[]
}

function constraintItemId(index: number): string {
  return `brief:constraint-${index}`
}

const LOCALES_ITEM_ID = 'brief:locales'

/**
 * The plan, flattened into the units a human decides on.
 *
 * The `brief` section carries the constraints because they are the part of
 * the analysis most worth a second pair of eyes: they were read out of the
 * document by pattern, and a pattern can misread. Note what un-confirming
 * one does and does not do — it drops the constraint from the approved plan,
 * so a later re-proposal is not bound by it; it does not resurrect anything
 * already removed from this draft, which was removed before the human ever
 * saw it. `SitePlanDraft.violations` says what that was.
 */
export function summarisePlan(draft: SitePlanDraft): readonly PlanSection[] {
  const constraintItems: PlanItem[] = draft.brief.constraints.map((constraint, index) => ({
    id: constraintItemId(index),
    section: 'brief' as const,
    title:
      constraint.kind === 'language'
        ? `Only these languages: ${(constraint.locales ?? []).join(', ')}`
        : `${constraint.kind === 'exclusion' ? 'No' : 'Must have'} ${constraint.topic ?? 'this'}`,
    detail: `Read from ${constraint.source}: “${constraint.quote}”`,
  }))

  return [
    {
      id: 'brief',
      title: 'What we understood',
      description: `${draft.brief.activity} — for ${draft.brief.audience}. Tone: ${draft.brief.tone}.`,
      mode: 'each',
      items: [
        {
          id: LOCALES_ITEM_ID,
          section: 'brief',
          title: `Languages: ${draft.brief.languages.join(', ')}`,
          detail: 'The locales the site will be set up with.',
        },
        ...constraintItems,
      ],
    },
    {
      id: 'contentModel',
      title: 'Content model',
      description: 'The collections the site would be created with. Each is judged on its own.',
      mode: 'each',
      items: draft.contentModel.collections.map((collection) => ({
        id: `contentModel:${collection.definition.name}`,
        section: 'contentModel' as const,
        title: `${collection.definition.labels.plural} (${collection.definition.name})`,
        detail: `${collection.rationale} Fields: ${Object.entries(collection.definition.fields)
          .map(([name, field]) => `${name} (${field.kind})`)
          .join(', ')}. Permissions: ${describePermissions(collection.definition.permissions)}.${
          collection.definition.routing === undefined
            ? ''
            : ` Routed at ${collection.definition.routing.pattern}.`
        }`,
      })),
    },
    {
      id: 'pages',
      title: 'Pages',
      description: 'The standing pages the brief asks for.',
      mode: 'each',
      items: draft.pages.map((page) => ({
        id: `pages:${page.slug}`,
        section: 'pages' as const,
        title: `${page.title} (/${page.slug})`,
        detail: page.purpose,
      })),
    },
    {
      id: 'skin',
      title: 'Design',
      description: 'Pick one of the proposed designs. They are alternatives, not a checklist.',
      mode: 'one-of',
      items: draft.skins.map((skin) => ({
        id: `skin:${skin.id}`,
        section: 'skin' as const,
        title: skin.label,
        detail: skin.rationale,
      })),
    },
    {
      id: 'demoContent',
      title: 'Demonstration content',
      description:
        'Starter entries, so the site is not empty on first sight. Edit or delete later.',
      mode: 'each',
      items: draft.demoContent.map((entry, index) => ({
        id: `demoContent:${index}`,
        section: 'demoContent' as const,
        title: `${entry.collection}: ${String(entry.values.title ?? entry.values.name ?? `entry ${index + 1}`)}`,
        detail: Object.entries(entry.values)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join(' · '),
      })),
    },
  ]
}

/**
 * Renders a collection's permissions in plain words, for the review screen.
 *
 * `permissions` is entirely the model's own choice — nothing in the brief
 * names a role — so a legitimate-but-surprising grant (`read: ['public']` on
 * something that sounds sensitive) is exactly the kind of thing a human
 * reviewer needs to see before accepting, not just the collections and
 * fields. `buildCollection` already refuses the unsafe case (`public`
 * granted `create`/`update`/`delete`) outright; this is the second half of
 * the fix — what remains after that refusal is still shown, never hidden
 * inside a rationale sentence that never mentioned it.
 */
function describePermissions(permissions: CollectionDefinition['permissions']): string {
  const entries = Object.entries(permissions)
    .map(([action, rule]) => [action, normalisePermissionRule(rule)] as const)
    .filter(([, rule]) => rule.roles.length > 0)
  if (entries.length === 0) return 'none granted'
  return entries
    .map(([action, rule]) => `${action}: ${rule.roles.join(', ')}${rule.own ? ' (own only)' : ''}`)
    .join('; ')
}

function allItems(sections: readonly PlanSection[]): readonly PlanItem[] {
  return sections.flatMap((section) => section.items)
}

/**
 * Turns decisions into the plan the human actually approved.
 *
 * Refuses rather than assumes, twice over: an item with no decision is
 * `SITE_PLAN_DECISION_MISSING` naming every one of them, and a decision for
 * an id that is not in the plan is `SITE_PLAN_DECISION_UNKNOWN_ITEM`. The
 * second is what stops a caller from inventing a blanket `{"*": "accepted"}`
 * and calling it consent.
 */
export function resolveApprovedPlan(
  draft: SitePlanDraft,
  decisions: PlanDecisions,
  now: () => Date = () => new Date(),
): ApprovedPlan {
  const sections = summarisePlan(draft)
  const items = allItems(sections)
  const known = new Set(items.map((item) => item.id))

  const unknown = Object.keys(decisions).filter((id) => !known.has(id))
  if (unknown.length > 0) {
    throw new CogentaError({
      code: 'SITE_PLAN_DECISION_UNKNOWN_ITEM',
      message: `${unknown.length} decision(s) refer to nothing in this plan: ${unknown.join(', ')}.`,
      hint: 'Decide on the item ids `summarisePlan` returned. There is no blanket "accept everything" id, deliberately.',
      details: { unknown },
    })
  }

  const undecided = items.filter((item) => decisions[item.id] === undefined).map((item) => item.id)
  if (undecided.length > 0) {
    throw new CogentaError({
      code: 'SITE_PLAN_DECISION_MISSING',
      message: `${undecided.length} item(s) of this plan have no decision: ${undecided.join(', ')}.`,
      hint: 'Every proposed item must be accepted or rejected explicitly before a plan can be applied — that is what makes this a review rather than a rubber stamp.',
      details: { undecided },
    })
  }

  for (const section of sections) {
    if (section.mode !== 'one-of') continue
    const accepted = section.items.filter((item) => decisions[item.id] === 'accepted')
    if (accepted.length > 1) {
      throw new CogentaError({
        code: 'SITE_PLAN_DECISION_UNKNOWN_ITEM',
        message: `The "${section.title}" section takes one choice, but ${accepted.length} were accepted.`,
        hint: 'Accept exactly one of the proposed designs and reject the others.',
        details: { section: section.id, accepted: accepted.map((item) => item.id) },
      })
    }
  }

  const accepted = (id: string): boolean => decisions[id] === 'accepted'

  const chosenSkin = draft.skins.find((skin) => accepted(`skin:${skin.id}`))
  const keptConstraints = draft.brief.constraints
    .map((constraint, index) => ({ constraint, index }))
    .filter(({ index }) => accepted(constraintItemId(index)))
    .map(({ constraint }) => ({ quote: constraint.quote, source: constraint.source }))

  return {
    draftId: draft.id,
    decidedAt: now().toISOString(),
    locales: accepted(LOCALES_ITEM_ID) ? draft.brief.languages : [],
    constraints: keptConstraints,
    collections: draft.contentModel.collections
      .filter((collection) => accepted(`contentModel:${collection.definition.name}`))
      .map((collection) => collection.definition),
    pages: draft.pages.filter((page) => accepted(`pages:${page.slug}`)),
    ...(chosenSkin === undefined ? {} : { skinId: chosenSkin.id, skin: chosenSkin.tokens }),
    demoContent: draft.demoContent.filter((_entry, index) => accepted(`demoContent:${index}`)),
    rejected: items.filter((item) => decisions[item.id] === 'rejected').map((item) => item.id),
  }
}
