import {
  type Attributes,
  blockHeadingTag,
  type Child,
  type ContentEntry,
  type HtmlElement,
  h,
  heading,
} from '@cogenta/theme-kit'

/**
 * The frame every block of this theme renders into, and the typographic
 * furniture the blocks share.
 *
 * The outer element carries the section rhythm (`--cg-section`, applied once
 * to every block alike) and paints edge to edge when a variant asks for a
 * band. The inner element is the twelve-column container: a front page, a
 * rail, an article and a colophon all sit on the same columns, so the left
 * edge of a headline, a standfirst and a caption never drift apart.
 *
 * `inner` is `figure` for a block whose semantics are a figure (a quotation
 * and its attribution, a photograph and its caption): `<figcaption>` must be
 * a direct child of its `<figure>`.
 */
export function section(
  outer: 'section' | 'div',
  block: string,
  className: string,
  attrs: Attributes,
  inner: 'div' | 'figure',
  ...children: readonly Child[]
): HtmlElement {
  return h(
    outer,
    { class: `cg-section ${className}`, 'data-block': block, ...attrs },
    h(inner, { class: `cg-container ${className}__inner` }, ...children),
  )
}

/**
 * A titled block's head, set the way a newspaper sets a section label: a
 * heavy rule in ink across the grid, the title in the display face under it.
 * `null` for an untitled block, so a caller can drop it into its children.
 */
export function sectionHead(blockName: string, title: string | undefined): HtmlElement | null {
  if (title === undefined) return null
  return h(
    'div',
    { class: 'cg-head' },
    heading(
      blockHeadingTag(blockName) ?? 'h2',
      { class: 'cg-head__title', 'data-field': 'title' },
      title,
    ),
  )
}

function parse(iso: string): Date | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

function format(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en', { timeZone: 'UTC', ...options }).format(date)
  }
}

/** `September 13, 2026` in the page's locale, or `null` when the value is not a date. */
export function longDate(iso: string, locale: string): string | null {
  const date = parse(iso)
  return date === null ? null : format(date, locale, { dateStyle: 'long' })
}

/** `Sep 13, 2026`, the form a listing sets under a headline, or `null`. */
export function shortDate(iso: string, locale: string): string | null {
  const date = parse(iso)
  return date === null ? null : format(date, locale, { dateStyle: 'medium' })
}

/**
 * A taxonomy field stores a term id, never a label: a value shaped like one
 * is not something a reader can be shown.
 */
const TERM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The label a listing sets above a headline, read from whichever of the usual
 * field names a collection declares: `kicker` first (a topic, a form such as
 * "Review", a columnist's name), then the plain-text section fields older
 * schemas use. Never invented, and never a term id.
 */
const KICKER_FIELDS = ['kicker', 'rubric', 'section', 'category', 'topic', 'department'] as const

export function entryKicker(entry: ContentEntry): string | undefined {
  for (const field of KICKER_FIELDS) {
    const value = entry[field]
    if (typeof value === 'string' && value.trim() !== '' && !TERM_ID.test(value.trim())) {
      return value
    }
  }
  return undefined
}

/**
 * The words a section front sets above a term's name, by the taxonomy's own
 * machine name. `TermArchiveInput.taxonomyName` is that name (`section`,
 * `author`), never a label, so a site in French would read "SECTION" over its
 * rubrique unless the theme says it in the page's language. A taxonomy the
 * theme has no word for is set in sentence case, as its owner named it.
 */
const TAXONOMY_WORDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: {
    section: 'Section',
    author: 'Author',
    tag: 'Tag',
    category: 'Category',
    topic: 'Topic',
  },
  fr: {
    section: 'Rubrique',
    author: 'Auteur',
    tag: 'Sujet',
    category: 'Catégorie',
    topic: 'Thème',
  },
}

export function taxonomyKicker(name: string, locale: string): string {
  const language = locale.toLowerCase().split('-')[0] ?? 'en'
  const known = TAXONOMY_WORDS[language]?.[name.toLowerCase()]
  if (known !== undefined) return known
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  if (words === '') return name
  return words.charAt(0).toLocaleUpperCase(locale) + words.slice(1)
}
