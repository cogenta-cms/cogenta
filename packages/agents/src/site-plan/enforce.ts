import { type ConstraintTopic, type DetectedConstraint, fold } from './constraints.js'
import type {
  ConstraintViolation,
  ContentModelProposal,
  ProposedCollection,
  ProposedPage,
} from './types.js'

/**
 * The other half of `./constraints.js`: what an explicit constraint actually
 * forbids in a proposal, and the removal that happens whether or not the
 * model cooperated.
 *
 * This is the mechanism behind the lot's hardest acceptance criterion. A
 * document that says "pas de blog" cannot produce a plan containing a blog,
 * because a `post` collection proposed anyway is removed here and reported
 * as a violation the human sees. The model is never trusted to have obeyed.
 */

/**
 * Names that mean a topic, in either language and either number. Matched
 * against a folded collection or page name, so `Actualités`, `actualites`
 * and `ACTUALITE` are one thing.
 */
const TOPIC_NAMES: Readonly<Record<ConstraintTopic, RegExp>> = {
  blog: /^(?:blog|posts?|articles?|actualites?|news|billets?|breves?)$/,
  ecommerce:
    /^(?:products?|produits?|orders?|commandes?|carts?|paniers?|checkouts?|shops?|boutiques?|prices?|tarifs?|payments?|paiements?|invoices?|factures?)$/,
  comments: /^(?:comments?|commentaires?|avis)$/,
  membership: /^(?:members?|membres?|adherents?|accounts?|comptes?|subscriptions?|abonnes?)$/,
  forum: /^(?:forums?|threads?|topics?|sujets?|messages?|discussions?)$/,
  newsletter: /^(?:newsletters?|infolettres?|subscribers?|abonnes?_newsletter)$/,
  testimonials: /^(?:testimonials?|temoignages?|reviews?|avis_clients?)$/,
  events: /^(?:events?|evenements?|agendas?)$/,
  search: /^(?:searches?|recherches?)$/,
  multilingual: /$^/,
}

/** Words in a page title that mean a topic. Looser than a collection name, because a title is prose. */
const TOPIC_IN_TITLE: Readonly<Record<ConstraintTopic, RegExp>> = {
  blog: /\b(?:blog|actualites?|news|articles?)\b/,
  ecommerce: /\b(?:boutique|shop|store|panier|cart|checkout|commander|buy now)\b/,
  comments: /\b(?:commentaires?|comments?)\b/,
  membership: /\b(?:espace membres?|mon compte|my account|login|connexion|sign in|register)\b/,
  forum: /\b(?:forum|messagerie|chat)\b/,
  newsletter: /\b(?:newsletters?|infolettres?)\b/,
  testimonials: /\b(?:temoignages?|testimonials?|avis clients?)\b/,
  events: /\b(?:evenements?|agenda|events?)\b/,
  search: /\b(?:recherche|search)\b/,
  multilingual: /$^/,
}

function excludedTopics(constraints: readonly DetectedConstraint[]): readonly DetectedConstraint[] {
  return constraints.filter((entry) => entry.kind === 'exclusion' && entry.topic !== undefined)
}

function matchesTopic(name: string, topic: ConstraintTopic): boolean {
  return TOPIC_NAMES[topic].test(fold(name))
}

function titleMatchesTopic(title: string, topic: ConstraintTopic): boolean {
  return TOPIC_IN_TITLE[topic].test(fold(title))
}

export interface EnforcementResult<T> {
  readonly kept: readonly T[]
  readonly violations: readonly ConstraintViolation[]
}

export function enforceOnContentModel(
  proposal: ContentModelProposal,
  constraints: readonly DetectedConstraint[],
): EnforcementResult<ProposedCollection> & { readonly proposal: ContentModelProposal } {
  const excluded = excludedTopics(constraints)
  const kept: ProposedCollection[] = []
  const violations: ConstraintViolation[] = []

  for (const collection of proposal.collections) {
    const breach = excluded.find(
      (constraint) =>
        constraint.topic !== undefined &&
        matchesTopic(collection.definition.name, constraint.topic),
    )
    if (breach === undefined) {
      kept.push(collection)
      continue
    }
    violations.push({
      constraint: breach,
      proposed: `collection "${collection.definition.name}"`,
      action: 'removed',
      explanation: `The document rules out ${breach.topic}: “${breach.quote}”. The proposed “${collection.definition.name}” collection was removed from the plan.`,
    })
  }

  return { kept, violations, proposal: { collections: kept } }
}

export function enforceOnPages(
  pages: readonly ProposedPage[],
  constraints: readonly DetectedConstraint[],
): EnforcementResult<ProposedPage> {
  const excluded = excludedTopics(constraints)
  const kept: ProposedPage[] = []
  const violations: ConstraintViolation[] = []

  for (const page of pages) {
    const breach = excluded.find(
      (constraint) =>
        constraint.topic !== undefined &&
        (titleMatchesTopic(page.title, constraint.topic) ||
          matchesTopic(page.slug, constraint.topic)),
    )
    if (breach === undefined) {
      kept.push(page)
      continue
    }
    violations.push({
      constraint: breach,
      proposed: `page “${page.title}” (/${page.slug})`,
      action: 'removed',
      explanation: `The document rules out ${breach.topic}: “${breach.quote}”. The proposed page “${page.title}” was removed from the plan.`,
    })
  }

  return { kept, violations }
}

/**
 * A `language` constraint is exhaustive by construction (`constraints.ts`
 * only recognises the "uniquement"/"only" forms), so a locale outside it is
 * not a preference the model may override.
 */
export function enforceOnLanguages(
  languages: readonly string[],
  constraints: readonly DetectedConstraint[],
): EnforcementResult<string> {
  const constraint = constraints.find((entry) => entry.kind === 'language')
  if (constraint === undefined || constraint.locales === undefined) {
    return { kept: languages, violations: [] }
  }
  const allowed = new Set(constraint.locales)
  const kept = languages.filter((locale) => allowed.has(locale))
  const dropped = languages.filter((locale) => !allowed.has(locale))
  const violations: ConstraintViolation[] =
    dropped.length === 0
      ? []
      : [
          {
            constraint,
            proposed: `locales ${dropped.join(', ')}`,
            action: 'removed',
            explanation: `The document limits the site to ${constraint.locales.join(', ')}: “${constraint.quote}”. ${dropped.join(', ')} ${dropped.length === 1 ? 'was' : 'were'} removed from the plan.`,
          },
        ]
  // Never return an empty locale list: a site has to render in something,
  // and the constrained set is the honest fallback when the model proposed
  // nothing inside it.
  return { kept: kept.length > 0 ? kept : [...constraint.locales], violations }
}
