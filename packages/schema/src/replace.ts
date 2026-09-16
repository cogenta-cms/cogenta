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
 * Rich text is walked `span` by `span`. Concatenating the spans of a
 * paragraph to run one replacement over the whole string would lose the
 * marks, the links and the keys that make it rich text. The cost is stated in
 * the lot: an occurrence split across two spans ("Cogen|ta", cut by a bold
 * run) is not found, because finding it would mean rewriting how the sentence
 * is formatted.
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
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
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
