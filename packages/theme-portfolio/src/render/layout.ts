import {
  type Attributes,
  blockHeadingTag,
  type Child,
  type ContentEntry,
  entryDate,
  type HtmlElement,
  h,
  heading,
} from '@cogenta/theme-kit'

/**
 * The frame every block of this theme renders into, and the small pieces of
 * typography the blocks share.
 *
 * The outer element carries the one section rhythm (`--cg-section`, the same
 * for every block) and paints edge to edge when a variant asks for a band.
 * The inner element is the twelve-column container, so the left edge of a
 * statement, a project image, a caption and a list of services is always the
 * same line.
 *
 * `inner` is `figure` for a block whose semantics are a figure (a quotation
 * and its attribution, an image and its caption): `<figcaption>` must be a
 * direct child of its `<figure>`.
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
 * The label of a titled block: a hairline across the whole container and the
 * title under it, small, in the text face. A studio lets the work carry the
 * page, so a section says what it is and gets out of the way. On a wide
 * screen the label sits in the first three columns and the content starts at
 * the fourth (`.cg-split`), or it runs above a full-width grid.
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

/**
 * A taxonomy field stores a term id, never a label: a value shaped like one
 * is not something a visitor can be shown.
 */
const TERM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function plainText(entry: ContentEntry, fields: readonly string[]): string | undefined {
  for (const field of fields) {
    const value = entry[field]
    if (typeof value === 'string' && value.trim() !== '' && !TERM_ID.test(value.trim())) {
      return value.trim()
    }
  }
  return undefined
}

const CLIENT_FIELDS = ['client', 'clientName', 'customer', 'organisation', 'organization'] as const
const DISCIPLINE_FIELDS = ['discipline', 'role', 'service', 'category', 'kicker'] as const

/** A four-digit year, from a `year` field when the collection keeps one, or from the entry's date. */
export function entryYear(entry: ContentEntry): string | undefined {
  const declared = entry.year
  if (typeof declared === 'string' && /^\d{4}$/.test(declared.trim())) return declared.trim()
  if (typeof declared === 'number' && Number.isInteger(declared)) return String(declared)
  const iso = entryDate(entry)
  return iso === undefined ? undefined : yearOf(iso)
}

/** `2025` from an ISO 8601 date, or `undefined` when the value is not one. */
export function yearOf(iso: string): string | undefined {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? undefined : String(date.getUTCFullYear())
}

/**
 * The caption line a studio sets under a piece of work: client, discipline,
 * year, in that order, each only when the entry carries it. Read from the
 * plain-text fields a collection declares, never from a taxonomy id and never
 * invented.
 */
export interface WorkCaption {
  readonly client?: string
  readonly discipline?: string
  readonly year?: string
}

export function entryCaption(entry: ContentEntry): WorkCaption {
  const client = plainText(entry, CLIENT_FIELDS)
  const discipline = plainText(entry, DISCIPLINE_FIELDS)
  const year = entryYear(entry)
  return {
    ...(client === undefined ? {} : { client }),
    ...(discipline === undefined ? {} : { discipline }),
    ...(year === undefined ? {} : { year }),
  }
}

/**
 * A caption never repeats the title it sits under: a project named after its
 * client ("Fenmore Building Society") keeps the discipline and the year only.
 * The index, where the client has a column of its own, keeps it.
 */
export function captionUnder(caption: WorkCaption, title: string): WorkCaption {
  if (caption.client === undefined) return caption
  if (!title.toLocaleLowerCase().includes(caption.client.toLocaleLowerCase())) return caption
  const { client: _repeated, ...rest } = caption
  return rest
}

/** The caption as markup: one paragraph, one span per part, the separators drawn by the stylesheet. */
export function renderCaption(caption: WorkCaption, className: string): HtmlElement | null {
  const parts = [
    caption.client === undefined
      ? null
      : h('span', { class: `${className}-part`, 'data-part': 'client' }, caption.client),
    caption.discipline === undefined
      ? null
      : h('span', { class: `${className}-part`, 'data-part': 'discipline' }, caption.discipline),
    caption.year === undefined
      ? null
      : h('span', { class: `${className}-part`, 'data-part': 'year' }, caption.year),
  ].filter((part): part is HtmlElement => part !== null)
  if (parts.length === 0) return null
  return h('p', { class: className }, parts)
}

/**
 * A taxonomy's own name, as a label: `disciplines` becomes `Disciplines`,
 * `project_team` becomes `Project team`. The name is the one the site owner
 * gave the taxonomy; this only sets it in sentence case.
 */
export function taxonomyLabel(name: string, locale: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  if (words === '') return name
  return words.charAt(0).toLocaleUpperCase(locale) + words.slice(1)
}

/**
 * The word for "year" in the page's own language, from the platform's own
 * data (`Intl.DisplayNames`), so the fact sheet of a project page labels its
 * date without a translation table this theme would have to carry.
 */
export function yearLabel(locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'dateTimeField' }).of('year')
    if (name !== undefined && name !== '') {
      return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
    }
  } catch {
    // An invalid locale tag: fall through to the English field name.
  }
  return 'Year'
}
