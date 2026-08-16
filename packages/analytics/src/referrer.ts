/**
 * Reduces a `Referer` header to a bare domain, never the full URL.
 *
 * A full referrer URL routinely carries a search query, a document id, or a
 * session token that belongs to the *other* site's visitor — recording it
 * verbatim would leak that visitor's data through this one's analytics. The
 * domain is the only part that answers "where did this visit come from",
 * which is the only question this feature exists to answer.
 */
export function extractReferrerDomain(
  referrer: string | null | undefined,
  siteHost?: string | null | undefined,
): string | undefined {
  if (referrer === null || referrer === undefined || referrer.trim().length === 0) {
    return undefined
  }

  let url: URL
  try {
    url = new URL(referrer)
  } catch {
    return undefined
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined

  const host = url.hostname.toLowerCase()
  // Navigation from the site to itself is not a "referrer" worth recording —
  // every internal page-to-page click would otherwise show up as its own
  // top "referrer", drowning out the external sources the feature is for.
  if (siteHost !== undefined && siteHost !== null && host === siteHost.toLowerCase()) {
    return undefined
  }

  return host
}
