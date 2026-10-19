import type { RichTextDocument } from '@cogenta/blocks'

/**
 * The tools both languages of the `documentation` blueprint write with: the
 * product's names, and a small writer that turns a line of Markdown-like text
 * into the rich text of contract A.
 */

export const DEFAULT_PRODUCT_NAME = 'Relay'

const DOCS_SUFFIX = /\s+(docs|documentation|developer docs|dev docs)$/i

/** "Relay Docs" → "Relay"; an empty or absent name → "Relay". */
export function productName(siteName: string | undefined): string {
  const trimmed = siteName?.trim().replace(DOCS_SUFFIX, '').trim()
  return trimmed === undefined || trimmed === '' ? DEFAULT_PRODUCT_NAME : trimmed
}

export interface ProductNames {
  /** "Relay" */
  readonly name: string
  /** "relay": the command, the npm package, the configuration file. */
  readonly cli: string
  /** "RELAY": the prefix of every environment variable. */
  readonly env: string
  /** "Relay": the prefix of every HTTP header the server sends. */
  readonly header: string
}

export function productNames(siteName: string | undefined): ProductNames {
  const name = productName(siteName)
  const ascii = name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '')
  const words = ascii.split(/[^A-Za-z0-9]+/).filter((word) => word !== '')
  const cli = words.join('-').toLowerCase() || 'relay'
  return {
    name,
    cli,
    env: words.join('_').toUpperCase() || 'RELAY',
    header: words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('-') || 'Relay',
  }
}

/** Puts the product's own names in place of `%N%` (name), `%cli%` (command), `%ENV%` (environment prefix) and `%HDR%` (header prefix). */
export function fillNames(value: string, names: ProductNames): string {
  return value
    .replaceAll('%N%', names.name)
    .replaceAll('%cli%', names.cli)
    .replaceAll('%ENV%', names.env)
    .replaceAll('%HDR%', names.header)
}

/**
 * French typography, applied to prose and never to code: a narrow no-break
 * space before `;`, `?`, `!` and `%` and inside « guillemets », a no-break
 * space before `:` and between a figure and its unit. The French copy is
 * written with ordinary spaces and passes through here once, so a line cannot
 * break before its punctuation.
 */
export function frenchTypography(value: string): string {
  return value
    .replace(/ ([;?!»%])/g, ' $1')
    .replace(/« /g, '« ')
    .replace(/ :/g, ' :')
    .replace(/(\d) (?=(?:s|ms|min|h|j|Ko|Mo|Go|ko|Mio)(?![\p{L}\d]))/gu, '$1 ')
}

/**
 * `frenchTypography` over every string of a plain value (menus, settings,
 * widgets, block fields), leaving rich-text spans alone: they were set by
 * `writer`, which knows which of them are code.
 */
export function deepFrenchTypography<T>(value: T): T {
  if (typeof value === 'string') return frenchTypography(value) as T
  if (Array.isArray(value)) return value.map((item) => deepFrenchTypography(item)) as T
  if (typeof value === 'object' && value !== null) {
    if ((value as { _type?: unknown })._type === 'span') return value
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deepFrenchTypography(item)]),
    ) as T
  }
  return value
}

export function identityTypography(value: string): string {
  return value
}

export type Typography = (value: string) => string

export type NoteKind = 'Note' | 'Tip' | 'Warning'

export const NOTE_LABELS: Readonly<Record<'en' | 'fr', Readonly<Record<NoteKind, string>>>> = {
  en: { Note: 'Note', Tip: 'Tip', Warning: 'Warning' },
  fr: { Note: 'Remarque', Tip: 'Astuce', Warning: 'Attention' },
}

type TextNode = Extract<RichTextDocument[number], { _type: 'block' }>
type Span = TextNode['children'][number]
type MarkDefinition = TextNode['markDefs'][number]

/** `code`, **strong**, *em* and [a link](/docs/page), nothing else. */
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g

export interface WriterOptions {
  readonly locale?: 'en' | 'fr'
}

/**
 * One page's rich text, written in a handful of short calls. Every string
 * passes through `fillNames`, and the prose through the language's
 * typography; code spans are only filled.
 */
export function writer(prefix: string, names: ProductNames, options: WriterOptions = {}) {
  const locale = options.locale ?? 'en'
  const typo: Typography = locale === 'fr' ? frenchTypography : identityTypography
  let counter = 0
  const key = (): string => `${prefix}-${++counter}`
  const fill = (value: string): string => fillNames(value, names)

  function inline(source: string): { children: Span[]; markDefs: MarkDefinition[] } {
    const children: Span[] = []
    const markDefs: MarkDefinition[] = []
    for (const part of fill(source).split(INLINE)) {
      if (part === '') continue
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        children.push({ _key: key(), _type: 'span', text: part.slice(1, -1), marks: ['code'] })
      } else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        children.push({
          _key: key(),
          _type: 'span',
          text: typo(part.slice(2, -2)),
          marks: ['strong'],
        })
      } else if (part.startsWith('[') && part.endsWith(')') && part.includes('](')) {
        const split = part.indexOf('](')
        const mark = key()
        markDefs.push({ _key: mark, _type: 'link', href: part.slice(split + 2, -1) })
        children.push({
          _key: key(),
          _type: 'span',
          text: typo(part.slice(1, split)),
          marks: [mark],
        })
      } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        children.push({ _key: key(), _type: 'span', text: typo(part.slice(1, -1)), marks: ['em'] })
      } else {
        children.push({ _key: key(), _type: 'span', text: typo(part), marks: [] })
      }
    }
    return { children, markDefs }
  }

  const block = (style: TextNode['style'], source: string): TextNode => ({
    _key: key(),
    _type: 'block',
    style,
    ...inline(source),
  })

  return {
    p: (source: string): TextNode => block('normal', source),
    h2: (source: string): TextNode => block('h2', source),
    h3: (source: string): TextNode => block('h3', source),
    ul: (items: readonly string[]): TextNode[] =>
      items.map((item) => ({ ...block('normal', item), listItem: 'bullet', level: 1 })),
    ol: (items: readonly string[]): TextNode[] =>
      items.map((item) => ({ ...block('normal', item), listItem: 'number', level: 1 })),
    /** A code block: a paragraph whose spans all carry `code`, the first one (bold) naming the file or the language. */
    code: (label: string, source: string): TextNode => ({
      _key: key(),
      _type: 'block',
      style: 'normal',
      children: [
        ...(label === ''
          ? []
          : [
              { _key: key(), _type: 'span' as const, text: fill(label), marks: ['code', 'strong'] },
            ]),
        { _key: key(), _type: 'span', text: fill(source), marks: ['code'] },
      ],
      markDefs: [],
    }),
    /** A note: a blockquote that opens on a bold label, in the page's language. */
    note: (kind: NoteKind, source: string): TextNode => {
      const body = inline(` ${source}`)
      return {
        _key: key(),
        _type: 'block',
        style: 'blockquote',
        children: [
          { _key: key(), _type: 'span', text: NOTE_LABELS[locale][kind], marks: ['strong'] },
          ...body.children,
        ],
        markDefs: body.markDefs,
      }
    },
    /** A reference table: bullet items that open on a code term, then an optional italic type, then the description. */
    ref: (
      rows: readonly (readonly [term: string, meta: string | null, description: string])[],
    ): TextNode[] =>
      rows.map(([term, meta, description]) => {
        const rest = inline(` ${description}`)
        return {
          _key: key(),
          _type: 'block',
          style: 'normal',
          listItem: 'bullet',
          level: 1,
          children: [
            { _key: key(), _type: 'span', text: fill(term), marks: ['code'] },
            ...(meta === null
              ? []
              : [
                  {
                    _key: key(),
                    _type: 'span' as const,
                    text: ` ${typo(fill(meta))}.`,
                    marks: ['em'],
                  },
                ]),
            ...rest.children,
          ],
          markDefs: rest.markDefs,
        }
      }),
  }
}

export type DocumentationWriter = ReturnType<typeof writer>
