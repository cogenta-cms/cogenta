import { fold } from './constraints.js'
import type { ExistingSiteSnapshot } from './site-context.js'
import type { ProposedPage } from './types.js'

/**
 * Fiche 60 task 5 — "un site sans page « contact » reçoit une suggestion
 * nommée comme telle, refusable comme tout le reste."
 *
 * Deterministic, like `./constraints.js`: this never asks a model. It
 * compares what the plan already proposes, plus what the site already
 * declares, against a closed list of pages most sites need — and says
 * nothing about the ones already covered. A suggestion is never applied by
 * itself (R6): it becomes its own reviewable item (`./approval.js`'s
 * `structuralGaps` section), accepted or rejected exactly like a proposed
 * collection or a proposed page.
 */

export const STRUCTURAL_GAP_TOPICS = ['contact', 'legal', 'privacy'] as const
export type StructuralGapTopic = (typeof STRUCTURAL_GAP_TOPICS)[number]

export interface StructuralGapSuggestion {
  /** Stable within a draft — one topic can appear at most once. */
  readonly id: StructuralGapTopic
  readonly topic: StructuralGapTopic
  readonly title: string
  readonly slug: string
  readonly reason: string
}

interface LocalisedText {
  readonly en: string
  readonly fr: string
}

interface GapTemplate {
  readonly topic: StructuralGapTopic
  /** Matched against folded (accent-stripped, lowercased) text — a page title, a collection name or label. */
  readonly pattern: RegExp
  readonly title: LocalisedText
  readonly slug: LocalisedText
  readonly reason: LocalisedText
}

const GAP_TEMPLATES: readonly GapTemplate[] = [
  {
    topic: 'contact',
    pattern: /\b(contact|nous contacter|contactez[- ]nous|reach us|get in touch)\b/,
    title: { en: 'Contact', fr: 'Contact' },
    slug: { en: 'contact', fr: 'contact' },
    reason: {
      en: 'Most sites need a way for a visitor to reach the site owner.',
      fr: 'La plupart des sites ont besoin d’un moyen pour qu’un visiteur puisse joindre le responsable du site.',
    },
  },
  {
    topic: 'legal',
    pattern: /\b(mentions legales|legal notice|imprint|impressum)\b/,
    title: { en: 'Legal notice', fr: 'Mentions légales' },
    slug: { en: 'legal-notice', fr: 'mentions-legales' },
    reason: {
      en: 'Legally required in most jurisdictions once a site names an identified owner.',
      fr: 'Obligatoire dans la plupart des juridictions dès qu’un site nomme un responsable identifié.',
    },
  },
  {
    topic: 'privacy',
    pattern: /\b(politique de confidentialite|vie privee|privacy policy|donnees personnelles)\b/,
    title: { en: 'Privacy policy', fr: 'Politique de confidentialité' },
    slug: { en: 'privacy-policy', fr: 'politique-de-confidentialite' },
    reason: {
      en: 'Expected wherever the site collects any personal data — a contact form, an account, analytics.',
      fr: 'Attendue dès que le site collecte des données personnelles — un formulaire de contact, un compte, des statistiques de visite.',
    },
  },
]

function covered(pattern: RegExp, texts: readonly string[]): boolean {
  return texts.some((text) => pattern.test(fold(text)))
}

function pick(text: LocalisedText, locale: string): string {
  return locale.toLowerCase().startsWith('fr') ? text.fr : text.en
}

export interface DetectStructuralGapsInput {
  readonly proposedPages: readonly ProposedPage[]
  readonly existingSite: ExistingSiteSnapshot
  /** Which language to phrase a suggestion's title/reason in. Defaults to `en`. */
  readonly locale?: string
}

export function detectStructuralGaps(
  input: DetectStructuralGapsInput,
): readonly StructuralGapSuggestion[] {
  const locale = input.locale ?? 'en'
  const known: string[] = [
    ...input.proposedPages.flatMap((page) => [page.title, page.slug]),
    ...input.existingSite.collections.flatMap((collection) => [
      collection.name,
      collection.labels.singular,
      collection.labels.plural,
    ]),
  ]

  const suggestions: StructuralGapSuggestion[] = []
  for (const template of GAP_TEMPLATES) {
    if (covered(template.pattern, known)) continue
    suggestions.push({
      id: template.topic,
      topic: template.topic,
      title: pick(template.title, locale),
      slug: pick(template.slug, locale),
      reason: pick(template.reason, locale),
    })
  }
  return suggestions
}
