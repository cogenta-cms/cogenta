import { type IndexableOptions, isIndexable } from './indexable.js'
import type { SeoResource, SeoSite } from './types.js'
import { canonicalUrl } from './url.js'

/**
 * `hreflang`, derived from the translation family (ADR-0014).
 *
 * The model is one entry per language, translations pointing at their source
 * through `translationOf`. The set of entries sharing a source is the family,
 * and the family *is* the annotation: contract A says so explicitly, so nothing
 * here reads a per-field translation or a locale suffix.
 *
 * ## Why reciprocity is a shape, not a check
 *
 * Google discards a whole `hreflang` cluster the moment one page fails to point
 * back. The usual way to get this wrong is to compute alternates per page —
 * "what are the other languages of *this* entry" — because then each page owns
 * its own answer and the answers drift the instant one of them is filtered
 * differently.
 *
 * So the alternate list is computed **once per family** and handed unchanged to
 * every member, self included. Reciprocity then cannot fail: A and B are not
 * two lists that happen to agree, they are the same list. The test suite still
 * asserts it, because the property is the whole point of the module.
 */

export interface HreflangAlternate {
  /** A BCP 47 tag, or `x-default`. */
  readonly hreflang: string
  readonly href: string
}

export interface TranslationFamily {
  /** The id of the source entry, which is the family's identity. */
  readonly sourceId: string
  /** Indexable members only, sorted by locale so output is stable. */
  readonly members: readonly SeoResource[]
}

/** A translation points at its source; a source points at nothing (ADR-0014). */
function familyIdOf(resource: SeoResource): string {
  return resource.entry.translationOf ?? resource.entry.id
}

/**
 * Groups resources into translation families, dropping everything unpublished
 * first.
 *
 * The filter runs **before** grouping on purpose. A draft German translation
 * must not appear as an alternate of the published French one: the tag would
 * advertise a URL that 404s, and a crawler that follows it distrusts the rest
 * of the cluster.
 */
export function groupTranslationFamilies(
  site: SeoSite,
  resources: readonly SeoResource[],
  options: IndexableOptions = {},
): readonly TranslationFamily[] {
  const families = new Map<string, SeoResource[]>()

  for (const resource of resources) {
    if (!isIndexable(site, resource, options)) continue
    const id = familyIdOf(resource)
    const existing = families.get(id)
    if (existing === undefined) families.set(id, [resource])
    else existing.push(resource)
  }

  return [...families.entries()]
    .map(([sourceId, members]) => ({
      sourceId,
      members: [...members].sort((a, b) => a.entry.locale.localeCompare(b.entry.locale)),
    }))
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
}

/**
 * The alternate set of a family: one entry per language, plus `x-default`.
 *
 * `x-default` names the page a crawler should serve to a user whose language
 * the site does not cover, and the only defensible answer is the **source**
 * entry — the one with no `translationOf`. When the source is not published,
 * no `x-default` is emitted at all: picking a translation instead would be a
 * guess, and a wrong `x-default` sends every unmatched visitor to a language
 * chosen at random by insertion order.
 */
export function alternatesFor(
  site: SeoSite,
  family: TranslationFamily,
): readonly HreflangAlternate[] {
  const alternates: HreflangAlternate[] = []
  const seen = new Set<string>()

  for (const member of family.members) {
    const href = canonicalUrl(site, member)
    // `isIndexable` already established the URL exists; the null branch is a
    // type narrowing, not a case.
    if (href === null) continue
    if (seen.has(member.entry.locale)) continue
    seen.add(member.entry.locale)
    alternates.push({ hreflang: member.entry.locale, href })
  }

  const source = family.members.find((member) => member.entry.translationOf === null)
  if (source !== undefined) {
    const href = canonicalUrl(site, source)
    if (href !== null) alternates.push({ hreflang: 'x-default', href })
  }

  return alternates
}

/**
 * Alternates keyed by entry id, for a whole page set.
 *
 * Every member of a family maps to the *same array instance*. That is what
 * makes reciprocity structural rather than emergent.
 */
export function buildHreflangMap(
  site: SeoSite,
  resources: readonly SeoResource[],
  options: IndexableOptions = {},
): ReadonlyMap<string, readonly HreflangAlternate[]> {
  const map = new Map<string, readonly HreflangAlternate[]>()

  for (const family of groupTranslationFamilies(site, resources, options)) {
    // A family of one gets no alternates: a self-referencing `hreflang` on a
    // page with no translation is noise, and Google says as much.
    if (family.members.length < 2) continue

    const alternates = alternatesFor(site, family)
    for (const member of family.members) map.set(member.entry.id, alternates)
  }

  return map
}
