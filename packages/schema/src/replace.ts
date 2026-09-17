import { titleOf } from './search/extract.js'
import type { BlockZones, ContentEntry, ContentValues } from './store/types.js'
import type { CollectionDefinition } from './types.js'

/**
 * Finding a phrase in an entry, and saying what it would become (L34 step 1).
 *
 * Pure on purpose: it reads an entry and returns a *plan*, it never writes.
 * The two-step rule the whole lot rests on — show, then apply — is only
 * trustworthy if what is shown is computed by the same function that later
 * produces what is written, so this is that function, and the caller decides
 * whether to keep the result or hand it to `update`.
 *
 * What it reaches, and what it leaves alone:
 *
 * - **plain text and rich text fields** of the entry, and the text inside its
 *   blocks — that is where content lives in this CMS;
 * - **never a slug**: changing one silently breaks every link to the page, and
 *   that is a decision taken per page with a redirect, not in bulk;
 * - **never an id, a relation, a media reference, a number or a boolean**:
 *   they are not text, they are links and values.
 *
 * Rich text is read **paragraph by paragraph**, not span by span. A phrase
 * cut in two by a formatting run — "Cogen|ta", where the last two letters are
 * bold — used to be invisible to this tool, which is exactly the occurrence a
 * person notices afterwards and has to fix by hand (L34's own stated cost,
 * lifted here).
 *
 * The spans are joined to *find*, and written back into the spans they came
 * from: everything outside a match keeps its own span, its marks and its key,
 * and a replacement that straddles a boundary is written into the span where
 * the match began. That last part is a real choice and it is worth stating —
 * the replacement takes the formatting of its first span, so "Cogen|**ta**"
 * becomes "Cogenta SA" in the plain run rather than half-bold. Nothing else
 * in the paragraph changes.
 */

export interface ReplaceOptions {
  readonly find: string
  readonly replace: string
  /**
   * Default `false`: a brand rename is almost always case-sensitive, and
   * quietly matching "cogenta" when someone typed "Cogenta" is how a
   * replacement reaches text nobody meant.
   */
  readonly caseInsensitive?: boolean
  /** Only whole words, so replacing "art" does not maul "partisan". */
  readonly wholeWord?: boolean
}

/** One place a phrase was found, named so a person can recognise it. */
export interface ReplacementHit {
  /** `title`, `body[2].children[0]`, `blocks.body[1].heading` — where it is. */
  readonly path: string
  /** The text around the match, as it is now. */
  readonly before: string
  /** The same text, as it would be. */
  readonly after: string
  readonly occurrences: number
}

export interface EntryReplacementPlan {
  readonly entryId: string
  readonly collection: string
  readonly locale: string
  /**
   * The entry's title as it reads now, before any replacement — what an editor
   * recognises it by in a preview. Empty when the collection has no text field
   * to take one from.
   */
  readonly title: string
  readonly hits: readonly ReplacementHit[]
  readonly occurrences: number
  /** The values to write, present only when something would change. */
  readonly values?: ContentValues
  readonly blocks?: BlockZones
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function matcherFor(options: ReplaceOptions): RegExp | null {
  if (options.find === '') return null
  const escaped = escapeRegExp(options.find)
  const body = options.wholeWord === true ? `\\b${escaped}\\b` : escaped
  return new RegExp(body, options.caseInsensitive === true ? 'giu' : 'gu')
}

function countIn(text: string, matcher: RegExp): number {
  matcher.lastIndex = 0
  let count = 0
  while (matcher.exec(text) !== null) {
    count += 1
    // A zero-length match cannot happen here — `find` is non-empty — but a
    // guard costs nothing next to an infinite loop.
    if (matcher.lastIndex === 0) break
  }
  matcher.lastIndex = 0
  return count
}

/** Which fields of a collection hold text this tool may touch. */
export function replaceableFields(collection: CollectionDefinition): readonly string[] {
  return Object.entries(collection.fields)
    .filter(([, field]) => field.kind === 'text' || field.kind === 'richText')
    .map(([name]) => name)
}

interface Walked {
  readonly value: unknown
  readonly hits: readonly ReplacementHit[]
}

/**
 * Replaces inside any value the store may hold, remembering where it was.
 *
 * Deliberately structural rather than typed per field kind: a block's data is
 * whatever its own schema declared, and a plugin's block (L32) declares its
 * own fields, so the only honest rule is "every string that is not an
 * identifier".
 */
/**
 * The spans of one rich-text node, rewritten as if their texts were one
 * string. `null` when this is not such a node — the caller then walks it the
 * ordinary way.
 */
function replaceAcrossSpans(
  children: readonly unknown[],
  matcher: RegExp,
  replacement: string,
): {
  readonly texts: readonly string[]
  readonly before: string
  readonly occurrences: number
} | null {
  const texts: string[] = []
  for (const child of children) {
    if (typeof child !== 'object' || child === null) return null
    const text = (child as Record<string, unknown>)['text']
    if (typeof text !== 'string') return null
    texts.push(text)
  }
  if (texts.length === 0) return null

  const joined = texts.join('')
  matcher.lastIndex = 0
  const matches = [...joined.matchAll(matcher)]
  if (matches.length === 0) return null

  const starts: number[] = []
  let offset = 0
  for (const text of texts) {
    starts.push(offset)
    offset += text.length
  }

  const out = texts.map(() => '')
  const keepSlice = (from: number, to: number): void => {
    for (const [index, text] of texts.entries()) {
      const begin = Math.max(from, starts[index] as number)
      const end = Math.min(to, (starts[index] as number) + text.length)
      if (end > begin) out[index] += joined.slice(begin, end)
    }
  }
  // The span a position belongs to: the last one that starts at or before it,
  // so a match beginning exactly on a boundary lands in the span it is inside.
  const spanAt = (position: number): number => {
    for (let index = texts.length - 1; index >= 0; index -= 1) {
      if (position >= (starts[index] as number)) return index
    }
    return 0
  }

  let cursor = 0
  for (const match of matches) {
    const start = match.index
    keepSlice(cursor, start)
    out[spanAt(start)] += replacement
    cursor = start + match[0].length
  }
  keepSlice(cursor, joined.length)

  return { texts: out, before: joined, occurrences: matches.length }
}

function walk(value: unknown, matcher: RegExp, replacement: string, path: string): Walked {
  if (typeof value === 'string') {
    const occurrences = countIn(value, matcher)
    if (occurrences === 0) return { value, hits: [] }
    matcher.lastIndex = 0
    const after = value.replaceAll(matcher, replacement)
    return { value: after, hits: [{ path, before: value, after, occurrences }] }
  }

  if (Array.isArray(value)) {
    const hits: ReplacementHit[] = []
    const next = value.map((item, index) => {
      const walked = walk(item, matcher, replacement, `${path}[${index}]`)
      hits.push(...walked.hits)
      return walked.value
    })
    return { value: next, hits }
  }

  if (typeof value === 'object' && value !== null) {
    const hits: ReplacementHit[] = []
    const next: Record<string, unknown> = {}
    const children = (value as Record<string, unknown>)['children']
    const acrossSpans = Array.isArray(children)
      ? replaceAcrossSpans(children, matcher, replacement)
      : null
    if (acrossSpans !== null && Array.isArray(children)) {
      next['children'] = children.map((child, index) => ({
        ...(child as Record<string, unknown>),
        text: acrossSpans.texts[index] ?? '',
      }))
      hits.push({
        path: `${path === '' ? '' : `${path}.`}children`,
        before: acrossSpans.before,
        after: acrossSpans.texts.join(''),
        occurrences: acrossSpans.occurrences,
      })
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'children' && acrossSpans !== null) continue
      // Keys that name something rather than say something. `_key`, `_type`,
      // `href` and `id` are identity and links: replacing inside them would
      // break a mark, a relation or a URL while looking like a text edit.
      if (IDENTITY_KEYS.has(key)) {
        next[key] = item
        continue
      }
      const walked = walk(item, matcher, replacement, path === '' ? key : `${path}.${key}`)
      hits.push(...walked.hits)
      next[key] = walked.value
    }
    return { value: next, hits }
  }

  return { value, hits: [] }
}

const IDENTITY_KEYS: ReadonlySet<string> = new Set([
  '_key',
  '_type',
  '_version',
  'id',
  'href',
  'collection',
  'media',
  'marks',
])

/**
 * What would change in one entry, and what it would become.
 *
 * Returns a plan with no hits — and no values — when nothing matches, so a
 * caller can skip the entry without comparing anything itself.
 */
export function planEntryReplacement(
  collection: CollectionDefinition,
  entry: ContentEntry,
  options: ReplaceOptions,
): EntryReplacementPlan {
  const empty: EntryReplacementPlan = {
    entryId: entry.id,
    collection: collection.name,
    locale: entry.locale,
    title: titleOf(collection, entry),
    hits: [],
    occurrences: 0,
  }
  const matcher = matcherFor(options)
  if (matcher === null) return empty

  const hits: ReplacementHit[] = []
  const values: Record<string, unknown> = { ...entry.values }
  for (const name of replaceableFields(collection)) {
    const walked = walk(entry.values[name], matcher, options.replace, name)
    hits.push(...walked.hits)
    values[name] = walked.value
  }

  const zones: Record<string, unknown> = {}
  for (const [zone, blocks] of Object.entries(entry.blocks)) {
    const walked = walk(blocks, matcher, options.replace, `blocks.${zone}`)
    hits.push(...walked.hits)
    zones[zone] = walked.value
  }

  if (hits.length === 0) return empty
  return {
    ...empty,
    hits,
    occurrences: hits.reduce((total, hit) => total + hit.occurrences, 0),
    values: values as ContentValues,
    blocks: zones as BlockZones,
  }
}
