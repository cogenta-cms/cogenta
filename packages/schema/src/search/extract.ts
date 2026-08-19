import type { BlockZones, ContentBlock, ContentEntry } from '../store/types.js'
import type { CollectionDefinition } from '../types.js'
import { condense } from './text.js'
import type { SearchDocument } from './types.js'

/**
 * Turning an entry into the text that gets indexed.
 *
 * Three sources, and only three (L1 task 16): `text` fields, the spans of a
 * `richText` document, and the data of the blocks. Everything else is either
 * not text — a number, a date, a colour, a media id, a relation id — or is
 * machine data that would pollute the ranking. A `json` field in particular is
 * configuration, not prose: indexing it makes every entry match `true`.
 */

/**
 * Keys whose values are structure, not content.
 *
 * Without this list a block would contribute `block`, `span`, `normal`,
 * `strong` and a URL to its own relevance, and an entry would rank on how many
 * bold runs it contains.
 */
const STRUCTURAL_KEYS = new Set([
  '_key',
  '_type',
  'key',
  'type',
  'id',
  'collection',
  'style',
  'listItem',
  'level',
  'marks',
  'markDefs',
  'href',
  'rel',
  'url',
  'src',
  'mimeType',
  'align',
  'variant',
  'theme',
  'icon',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Every string in a value, minus the structural keys.
 *
 * Recursive because contract B blocks nest — a `columns` block holds blocks,
 * and a `faq` block holds a list of question/answer pairs. Bounded by depth so
 * that a hand-written or imported block cannot turn indexing into a hang.
 */
function collectStrings(value: unknown, into: string[], depth = 0): void {
  if (depth > 8) return

  if (typeof value === 'string') {
    if (value.length > 0) into.push(value)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, into, depth + 1)
    return
  }

  if (!isRecord(value)) return

  for (const [key, nested] of Object.entries(value)) {
    if (STRUCTURAL_KEYS.has(key)) continue
    collectStrings(nested, into, depth + 1)
  }
}

/**
 * The prose of a rich text document: the `text` of every span, plus the
 * captions of the media nodes.
 *
 * Deliberately not `JSON.stringify`: the raw document is roughly half syntax,
 * and indexing it would let a search for `span` return every article on the
 * site while a search for a genuinely rare word would be diluted by it.
 */
export function extractRichText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const parts: string[] = []

  for (const node of value) {
    if (!isRecord(node)) continue

    if (node['_type'] === 'block') {
      const children = node['children']
      if (!Array.isArray(children)) continue
      for (const child of children) {
        if (isRecord(child) && typeof child['text'] === 'string') parts.push(child['text'])
      }
      continue
    }

    if (node['_type'] === 'media') {
      const caption = node['caption']
      if (typeof caption === 'string') parts.push(caption)
      continue
    }

    // An unknown node type is still content: a future contract B addition must
    // become searchable on the day it ships, not on the day this file is
    // remembered. The structural keys are filtered out all the same.
    collectStrings(node, parts)
  }

  return condense(parts.join(' '))
}

/** The prose of one block. Its `data` is contract B, so its shape is open. */
export function extractBlockText(block: ContentBlock): string {
  const parts: string[] = []
  collectStrings(block.data, parts)
  return condense(parts.join(' '))
}

function extractZones(zones: BlockZones): string {
  const parts: string[] = []
  for (const blocks of Object.values(zones)) {
    for (const block of blocks) {
      const text = extractBlockText(block)
      if (text.length > 0) parts.push(text)
    }
  }
  return condense(parts.join(' '))
}

/**
 * The field whose value labels a result.
 *
 * Fiche 01 ("Liste de contenu"), task 1: the same priority order
 * `packages/admin/src/lib/entry-title.ts` uses for every other screen that
 * names an entry, so a title reads the same in the collection list, the
 * trash and here. A declared `text` field named `title`, `name` or `label`
 * — in that priority order — and the first declared `text` field
 * otherwise, which is what an editor sees at the top of the form.
 */
const TITLE_FIELD_PRIORITY = ['title', 'name', 'label'] as const

function titleOf(collection: CollectionDefinition, entry: ContentEntry): string {
  for (const name of TITLE_FIELD_PRIORITY) {
    const field = collection.fields[name]
    if (field?.kind !== 'text') continue
    const value = entry.values[name]
    if (typeof value === 'string' && value.length > 0) return condense(value)
  }

  for (const [name, field] of Object.entries(collection.fields)) {
    if (field.kind !== 'text') continue
    const value = entry.values[name]
    if (typeof value === 'string' && value.length > 0) return condense(value)
  }

  return ''
}

/**
 * The indexable document for an entry.
 *
 * The title is repeated inside the body on purpose: none of the three engines
 * offers per-column weighting in a form the other two can match — Postgres has
 * `setweight`, MySQL has nothing, FTS5 has a per-column BM25 weight vector — so
 * the one portable way to make a title term count for more is to let it appear
 * twice in the text every engine ranks.
 */
export function searchDocumentFor(
  collection: CollectionDefinition,
  entry: ContentEntry,
): SearchDocument {
  const title = titleOf(collection, entry)
  const parts: string[] = []
  if (title.length > 0) parts.push(title)

  for (const [name, field] of Object.entries(collection.fields)) {
    const value = entry.values[name]

    if (field.kind === 'text') {
      if (typeof value === 'string' && value.length > 0) parts.push(condense(value))
      continue
    }

    if (field.kind === 'richText') {
      const text = extractRichText(value)
      if (text.length > 0) parts.push(text)
    }
  }

  const blocks = extractZones(entry.blocks)
  if (blocks.length > 0) parts.push(blocks)

  return {
    id: entry.id,
    collection: collection.name,
    locale: entry.locale,
    status: entry.status,
    title,
    body: condense(parts.join(' ')),
  }
}
