import { condense } from '@cogenta/schema'
import { type IndexableOptions, indexableResources } from './indexable.js'
import type { SeoResource, SeoSite } from './types.js'
import { canonicalUrl } from './url.js'

/**
 * `llms.txt` — the site, in Markdown, for a model that has one request to spend.
 *
 * The format (llmstxt.org) is a single `H1`, an optional `>` blockquote
 * summary, then `H2` sections of links with a short note each. It is Markdown
 * rather than XML because the consumer is a language model, and a sitemap is
 * exactly the wrong shape for one: 50 000 bare URLs with no titles say nothing
 * about what the site is.
 *
 * The same publication gate applies as everywhere else. A draft listed here is
 * worse than a draft in a sitemap: a model does not queue the URL for later, it
 * repeats the title in an answer immediately.
 */

export interface LlmsTxtLink {
  readonly title: string
  readonly url: string
  readonly note?: string
}

export interface LlmsTxtSection {
  readonly title: string
  readonly links: readonly LlmsTxtLink[]
}

export interface LlmsTxtOptions {
  readonly site: SeoSite
  /** Defaults to the site name. */
  readonly title?: string
  /** The blockquote line. Defaults to the site description. */
  readonly summary?: string
  /** Free paragraphs between the summary and the first section. */
  readonly details?: readonly string[]
  readonly sections: readonly LlmsTxtSection[]
}

/**
 * Markdown link escaping.
 *
 * A title containing `]` closes the link text early and the rest of the line
 * becomes prose; a URL containing a space or `)` breaks the target. Titles are
 * escaped, URLs are wrapped in angle brackets, which is the Markdown-specified
 * way to carry a URL with awkward characters.
 */
function escapeLinkText(value: string): string {
  return condense(value).replace(/([[\]\\])/gu, '\\$1')
}

function renderUrl(url: string): string {
  return /[()\s]/u.test(url) ? `<${url}>` : url
}

export function renderLlmsTxt(options: LlmsTxtOptions): string {
  const lines: string[] = [`# ${escapeLinkText(options.title ?? options.site.name)}`]

  const summary = options.summary ?? options.site.description
  if (summary !== undefined && summary.length > 0) {
    lines.push('', `> ${condense(summary)}`)
  }

  for (const paragraph of options.details ?? []) {
    lines.push('', condense(paragraph))
  }

  for (const section of options.sections) {
    if (section.links.length === 0) continue
    lines.push('', `## ${escapeLinkText(section.title)}`, '')
    for (const link of section.links) {
      const note = link.note === undefined ? '' : `: ${condense(link.note)}`
      lines.push(`- [${escapeLinkText(link.title)}](${renderUrl(link.url)})${note}`)
    }
  }

  return `${lines.join('\n')}\n`
}

const TITLE_FIELDS = ['title', 'name', 'label', 'heading']
const NOTE_FIELDS = ['excerpt', 'description', 'summary', 'subtitle']

function pick(resource: SeoResource, candidates: readonly string[]): string | undefined {
  for (const candidate of candidates) {
    if (resource.collection.fields[candidate] === undefined) continue
    const value = resource.entry.values[candidate]
    if (typeof value === 'string' && value.trim().length > 0) return condense(value)
  }
  return undefined
}

export interface LlmsTxtSectionsOptions extends IndexableOptions {
  /** Section heading for a collection. Defaults to its plural label. */
  readonly sectionTitle?: (collectionName: string) => string
  /** Entries listed per collection. Defaults to 100. */
  readonly limitPerSection?: number
}

/**
 * One section per collection, entries newest first.
 *
 * Grouping by collection rather than by URL depth is what makes the file useful:
 * "Articles", "Guides", "Authors" tells a model what kind of thing each link is
 * before it fetches any of them.
 */
export function llmsTxtSectionsFor(
  site: SeoSite,
  resources: readonly SeoResource[],
  options: LlmsTxtSectionsOptions = {},
): readonly LlmsTxtSection[] {
  const limit = options.limitPerSection ?? 100
  const byCollection = new Map<string, { title: string; links: LlmsTxtLink[] }>()

  for (const resource of indexableResources(site, resources, options)) {
    const url = canonicalUrl(site, resource)
    if (url === null) continue

    const name = resource.collection.name
    let section = byCollection.get(name)
    if (section === undefined) {
      section = {
        title: options.sectionTitle?.(name) ?? resource.collection.labels.plural,
        links: [],
      }
      byCollection.set(name, section)
    }

    const note = pick(resource, NOTE_FIELDS)
    section.links.push({
      title: pick(resource, TITLE_FIELDS) ?? url,
      url,
      ...(note === undefined ? {} : { note }),
    })
  }

  return [...byCollection.values()].map((section) => ({
    title: section.title,
    links: section.links.slice(0, limit),
  }))
}
