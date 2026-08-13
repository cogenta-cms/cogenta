import { CogentaError } from '@cogenta/core'
import type { SeoSite } from './types.js'
import { absoluteUrl } from './url.js'

/**
 * `robots.txt`.
 *
 * The format has no escaping whatsoever: a directive ends at the newline, full
 * stop. That makes a value containing a newline an *injection* — a path built
 * from a site setting could append `Disallow: /` and de-index the whole site
 * with no error anywhere. There is nothing to escape it with, so the only
 * correct handling is refusal, which is what `assertSingleLine` does.
 */

export interface RobotsGroup {
  /** One or more user agents this group applies to. */
  readonly userAgent: string | readonly string[]
  readonly allow?: readonly string[]
  readonly disallow?: readonly string[]
  /** Seconds. Ignored by Google, honoured by Bing and Yandex. */
  readonly crawlDelay?: number
}

export interface RobotsOptions {
  readonly site: SeoSite
  /** Defaults to a single group allowing everything. */
  readonly groups?: readonly RobotsGroup[]
  /** Site-relative sitemap paths. Emitted as absolute URLs, as the spec requires. */
  readonly sitemaps?: readonly string[]
  /**
   * Blocks every crawler, whatever `groups` says.
   *
   * For staging and preview hosts. It is a separate flag rather than a
   * convention so that "is this environment indexable" is one boolean somebody
   * can find, instead of a `Disallow` buried in a config file.
   */
  readonly allowIndexing?: boolean
}

function assertSingleLine(value: string, what: string): string {
  if (!/[\n\r]/u.test(value)) return value
  throw new CogentaError({
    code: 'CONFIG_INVALID',
    message: `A robots.txt ${what} may not contain a line break.`,
    hint: 'robots.txt has no escaping: a line break would be read as a new directive. Fix the value at its source.',
    details: { what },
  })
}

export function renderRobotsTxt(options: RobotsOptions): string {
  const lines: string[] = []

  if (options.allowIndexing === false) {
    lines.push('User-agent: *', 'Disallow: /')
  } else {
    const groups = options.groups ?? [{ userAgent: '*', allow: ['/'] }]
    for (const group of groups) {
      const agents = typeof group.userAgent === 'string' ? [group.userAgent] : group.userAgent
      for (const agent of agents) {
        lines.push(`User-agent: ${assertSingleLine(agent, 'user agent')}`)
      }
      // Allow before Disallow: both Google and Bing resolve a conflict by the
      // most specific rule, but a human reading the file resolves it by order.
      for (const path of group.allow ?? []) {
        lines.push(`Allow: ${assertSingleLine(path, 'path')}`)
      }
      for (const path of group.disallow ?? []) {
        lines.push(`Disallow: ${assertSingleLine(path, 'path')}`)
      }
      if (group.crawlDelay !== undefined) lines.push(`Crawl-delay: ${group.crawlDelay}`)
      lines.push('')
    }
  }

  // Sitemap lines are host-level, not group-level, so they go last and outside
  // any group. Put inside one, they are ignored by half the crawlers.
  const sitemaps = options.sitemaps ?? ['/sitemap.xml']
  if (sitemaps.length > 0) {
    if (lines.at(-1) !== '') lines.push('')
    for (const path of sitemaps) {
      lines.push(`Sitemap: ${assertSingleLine(absoluteUrl(options.site, path), 'sitemap URL')}`)
    }
  }

  return `${lines.join('\n').trimEnd()}\n`
}
