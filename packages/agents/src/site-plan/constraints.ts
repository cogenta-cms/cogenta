/**
 * L19's most expensive failure, named in the lot's own "pièges connus":
 * "Un plan de site généré qui ignore une contrainte explicite du document
 * (« pas de blog », « en anglais uniquement ») casse la confiance
 * immédiatement."
 *
 * The defence is not to ask the model more nicely. It is to read the
 * constraints out of the document **deterministically**, before any model
 * sees it, and then to check the model's proposal against them afterwards.
 * A model that ignores "pas de blog" cannot make a blog appear in the
 * accepted plan, because `enforceConstraints` (`./enforce.js`) removes it
 * and reports the violation — the model's cooperation is a nicety, not the
 * mechanism.
 *
 * This scanner is deliberately narrow. It recognises a closed vocabulary of
 * site features in French and English, and only inside a clause that
 * actually negates or requires. It will miss constraints phrased in ways it
 * does not know — which is why every constraint it finds is shown to the
 * human with the sentence it came from, and why the human can add their
 * own. It must not invent one, and it must not miss the plain forms.
 */

export const CONSTRAINT_KINDS = ['exclusion', 'requirement', 'language'] as const
export type ConstraintKind = (typeof CONSTRAINT_KINDS)[number]

/** The closed set of site features a constraint can be about. */
export const CONSTRAINT_TOPICS = [
  'blog',
  'ecommerce',
  'comments',
  'membership',
  'forum',
  'newsletter',
  'testimonials',
  'events',
  'search',
  'multilingual',
] as const
export type ConstraintTopic = (typeof CONSTRAINT_TOPICS)[number]

export interface DetectedConstraint {
  readonly kind: ConstraintKind
  /** `topic` for an exclusion or a requirement; absent for a language constraint, which carries `locales` instead. */
  readonly topic?: ConstraintTopic
  /** For `kind: 'language'` — the exhaustive list of locales the site may use. */
  readonly locales?: readonly string[]
  /** The sentence it was read from, verbatim, so a human can judge it. */
  readonly quote: string
  /** Which document, and which line of it. */
  readonly source: string
}

interface TopicPattern {
  readonly topic: ConstraintTopic
  readonly pattern: RegExp
}

/**
 * Keyword sets per topic. Accent-insensitive because the input is real
 * French typed by real people: "actualités", "actualites" and "ACTUALITÉS"
 * are the same word and only one of them is spelled correctly.
 */
const TOPIC_PATTERNS: readonly TopicPattern[] = [
  { topic: 'blog', pattern: /\b(blog|actualites?|news|billets?|posts?)\b/ },
  {
    topic: 'ecommerce',
    pattern:
      /\b(boutique|e-?commerce|vente en ligne|panier|paiements? en ligne|caisse|shop|store|cart|checkout|online sales?)\b/,
  },
  { topic: 'comments', pattern: /\b(commentaires?|comments?)\b/ },
  {
    topic: 'membership',
    pattern:
      /\b(espace membres?|espace adherents?|compte utilisateur|comptes? clients?|connexion|login|member area|user accounts?|sign-?up)\b/,
  },
  {
    topic: 'forum',
    pattern:
      /\b(forum|messagerie|chat|reseau social interne|community board|internal social network)\b/,
  },
  { topic: 'newsletter', pattern: /\b(newsletters?|infolettres?|mailing list)\b/ },
  { topic: 'testimonials', pattern: /\b(temoignages?|avis clients?|testimonials?|reviews?)\b/ },
  { topic: 'events', pattern: /\b(evenements?|agenda|events?|calendar)\b/ },
  { topic: 'search', pattern: /\b(recherche|moteur de recherche|search)\b/ },
]

/** Words that turn the rest of the clause into an exclusion. */
const NEGATIONS = [
  /\bpas de\b/,
  /\bpas d'/,
  /\baucune?\b/,
  /\bsans\b/,
  /\bni\b/,
  /\bjamais de\b/,
  /\bsurtout pas\b/,
  /\bon (?:ne )?veut pas\b/,
  /\bnous ne voulons pas\b/,
  /\bexclu[re]?\b/,
  /\binterdi(?:t|te|ts|tes)\b/,
  /\bno\b/,
  /\bnot?\s+(?:a|an|any)\b/,
  /\bwithout\b/,
  /\bwe (?:do not|don't) want\b/,
  /\bnever\b/,
  /\bexclude[sd]?\b/,
]

/** Words that turn the rest of the clause into a hard requirement. */
const REQUIREMENTS = [
  /\bobligatoire\b/,
  /\bimperatif\b/,
  /\bdoit (?:absolument )?(?:y )?(?:avoir|comporter|proposer|inclure)\b/,
  /\bil (?:nous )?faut\b/,
  /\bindispensable\b/,
  /\bc(?:'e|e)st le coeur\b/,
  /\bmust have\b/,
  /\brequired\b/,
  /\bmandatory\b/,
]

interface LanguagePattern {
  readonly pattern: RegExp
  readonly locales: readonly string[]
}

/**
 * Only the exhaustive forms — "uniquement", "seulement", "only". A document
 * that merely mentions a language is not constraining anything, and reading
 * it as a constraint would be exactly the kind of invention this module
 * exists to prevent.
 */
const LANGUAGE_PATTERNS: readonly LanguagePattern[] = [
  { pattern: /\b(?:en )?francais (?:uniquement|seulement|only)\b/, locales: ['fr'] },
  { pattern: /\buniquement en francais\b/, locales: ['fr'] },
  { pattern: /\bfrench only\b/, locales: ['fr'] },
  { pattern: /\b(?:en )?anglais (?:uniquement|seulement)\b/, locales: ['en'] },
  { pattern: /\buniquement en anglais\b/, locales: ['en'] },
  { pattern: /\benglish only\b/, locales: ['en'] },
  {
    pattern: /\bbilingue (?:francais (?:et|\/) anglais|anglais (?:et|\/) francais)\b/,
    locales: ['fr', 'en'],
  },
  {
    pattern: /\bbilingual (?:french (?:and|\/) english|english (?:and|\/) french)\b/,
    locales: ['en', 'fr'],
  },
]

/** Strips diacritics and lowercases, so one pattern matches every spelling a human actually types. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase()
}

/**
 * Splits into the units a constraint lives in: a bullet, a line, or a
 * sentence. Splitting on sentences alone loses bullet lists (which rarely
 * end in a full stop) and splitting on lines alone glues two sentences of a
 * paragraph together, so both boundaries count.
 */
function clauses(text: string): readonly string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    for (const sentence of trimmed.split(/(?<=[.!?;:])\s+/)) {
      const piece = sentence.trim()
      if (piece !== '') out.push(piece)
    }
  }
  return out
}

/**
 * `true` when the negation actually governs the topic, rather than merely
 * sharing a sentence with it. "Pas de blog, mais un agenda" must not
 * exclude the agenda, so a topic is only excluded when the nearest marker
 * *before* it is the negation — measured on the folded clause, where every
 * offset is comparable.
 */
function governs(folded: string, marker: RegExp, topic: RegExp): boolean {
  const markerAt = folded.search(marker)
  const topicAt = folded.search(topic)
  if (markerAt === -1 || topicAt === -1 || markerAt > topicAt) return false
  const between = folded.slice(markerAt, topicAt)
  // An adversative or a new clause ends the negation's reach.
  return !/\b(?:mais|par contre|en revanche|however|but|whereas)\b/.test(between)
}

export interface DetectConstraintsInput {
  readonly text: string
  readonly source: string
}

export function detectConstraints(input: DetectConstraintsInput): readonly DetectedConstraint[] {
  const found: DetectedConstraint[] = []
  const seen = new Set<string>()

  const add = (constraint: DetectedConstraint): void => {
    const key = `${constraint.kind}:${constraint.topic ?? (constraint.locales ?? []).join('+')}`
    if (seen.has(key)) return
    seen.add(key)
    found.push(constraint)
  }

  for (const clause of clauses(input.text)) {
    const folded = fold(clause)

    for (const language of LANGUAGE_PATTERNS) {
      if (language.pattern.test(folded)) {
        add({
          kind: 'language',
          locales: language.locales,
          quote: clause,
          source: input.source,
        })
      }
    }

    for (const { topic, pattern } of TOPIC_PATTERNS) {
      if (!pattern.test(folded)) continue
      const negation = NEGATIONS.find((marker) => governs(folded, marker, pattern))
      if (negation !== undefined) {
        add({ kind: 'exclusion', topic, quote: clause, source: input.source })
        continue
      }
      // A requirement marker is accepted wherever it sits in the clause,
      // unlike a negation. Real briefs put it after the thing it qualifies
      // at least as often as before — "agenda des chantiers (obligatoire)" —
      // and there is no second reading to guard against once no negation
      // governs the topic.
      const requirement = REQUIREMENTS.find((marker) => marker.test(folded))
      if (requirement !== undefined) {
        add({ kind: 'requirement', topic, quote: clause, source: input.source })
      }
    }
  }

  // A site told it may use exactly one locale is, by the same statement,
  // told not to be multilingual — spelling that out here means
  // `enforceConstraints` has one rule to apply rather than two.
  const language = found.find((entry) => entry.kind === 'language')
  if (language !== undefined && (language.locales ?? []).length === 1) {
    const already = found.some(
      (entry) => entry.kind === 'exclusion' && entry.topic === 'multilingual',
    )
    if (!already) {
      found.push({
        kind: 'exclusion',
        topic: 'multilingual',
        quote: language.quote,
        source: language.source,
      })
    }
  }

  return found
}
