/**
 * `status:draft cathedral` → the text to search plus the parameters the
 * existing `/api/search`, `/api/commerce/orders` and taxonomy routes already
 * accept (fiche 36 task 5).
 *
 * Parsed entirely on the client, never sent as-is: a filter here is only ever
 * translated into the query parameter the corresponding route already
 * validates and enforces permissions on (`status`, `collections`, `locale`).
 * An unknown `key:value` is left in the free text instead of silently
 * dropped — a reader who types `site:example.com` gets a search for that
 * literal string, not a filter that quietly did nothing.
 */

export interface ParsedSearchQuery {
  /** What is left to search for once every recognised filter is removed. */
  readonly text: string
  readonly status?: string
  readonly collection?: string
  readonly locale?: string
}

const FILTER_TOKEN = /^([a-z]+):(\S+)$/iu

const FILTER_KEYS = new Set(['status', 'collection', 'locale'])

export function parseInlineFilters(input: string): ParsedSearchQuery {
  const words: string[] = []
  let status: string | undefined
  let collection: string | undefined
  let locale: string | undefined

  for (const token of input.split(/\s+/u)) {
    if (token.length === 0) continue

    const match = FILTER_TOKEN.exec(token)
    if (match === null) {
      words.push(token)
      continue
    }

    const key = (match[1] as string).toLowerCase()
    const value = match[2] as string
    if (!FILTER_KEYS.has(key)) {
      words.push(token)
      continue
    }

    if (key === 'status') status = value.toLowerCase()
    else if (key === 'collection') collection = value
    else if (key === 'locale') locale = value.toLowerCase()
  }

  return {
    text: words.join(' '),
    ...(status === undefined ? {} : { status }),
    ...(collection === undefined ? {} : { collection }),
    ...(locale === undefined ? {} : { locale }),
  }
}
