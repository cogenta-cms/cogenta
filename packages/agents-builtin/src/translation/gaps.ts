/**
 * Which translations are missing, and which have fallen behind (L5 task 10).
 *
 * ADR-0014 makes a translation a real entry of its own, linked by
 * `translationOf`. That is what makes both questions answerable by arithmetic:
 * a family is a set of entries with a locale each, and a member is stale when
 * it was last written before its source was.
 */

export type TranslationIssue = 'missing' | 'stale'

export interface TranslationMember {
  readonly id: string
  readonly locale: string
  readonly updatedAt: string
  readonly title: string
}

export interface TranslationFamily {
  readonly collection: string
  /** The entry the others are translations of. */
  readonly source: TranslationMember
  readonly members: readonly TranslationMember[]
}

export interface TranslationGap {
  readonly issue: TranslationIssue
  readonly collection: string
  readonly sourceId: string
  readonly title: string
  readonly locale: string
  readonly detail: string
}

export function findTranslationGaps(
  families: readonly TranslationFamily[],
  locales: readonly string[],
): readonly TranslationGap[] {
  const gaps: TranslationGap[] = []

  for (const family of families) {
    const byLocale = new Map(family.members.map((member) => [member.locale, member]))
    byLocale.set(family.source.locale, family.source)

    for (const locale of locales) {
      if (locale === family.source.locale) continue
      const member = byLocale.get(locale)
      if (member === undefined) {
        gaps.push({
          issue: 'missing',
          collection: family.collection,
          sourceId: family.source.id,
          title: family.source.title,
          locale,
          detail: `No ${locale} version of this entry exists.`,
        })
        continue
      }
      // Strictly before: same instant means translated in the same edit.
      if (Date.parse(member.updatedAt) < Date.parse(family.source.updatedAt)) {
        gaps.push({
          issue: 'stale',
          collection: family.collection,
          sourceId: family.source.id,
          title: family.source.title,
          locale,
          detail: `The ${locale} version was last written before the source was changed.`,
        })
      }
    }
  }

  return gaps
}
