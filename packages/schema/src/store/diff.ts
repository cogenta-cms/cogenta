import { CogentaError } from '@cogenta/core'
import type { BlockZones, ContentBlock, ContentValues } from './types.js'

/**
 * Field-by-field and block-by-block. Never a diff of a serialisation.
 *
 * The L1 spec is blunt about why: a diff computed on the JSON text of an entry
 * is unreadable, and unreadable is the same as absent — nobody approves a change
 * they cannot see. An editor wants "the subtitle changed" and "the third block
 * moved to second", not a wall of braces.
 */

export type ChangeKind = 'added' | 'removed' | 'changed'

export interface FieldChange {
  readonly field: string
  readonly change: ChangeKind
  readonly before: unknown
  readonly after: unknown
  /**
   * A word-level diff of `before`/`after`, populated only by `enrichWordDiffs`
   * — never by `diffValues` itself, so the plain structural diff this file
   * has always produced stays exactly as it was for every existing caller.
   * Present only for a `changed` field whose two values are both plain text
   * (a `text` field) or both extract to plain text (a `richText` document).
   */
  readonly words?: readonly WordChange[]
}

export interface BlockChange {
  /** The block zone this block belongs to. */
  readonly zone: string
  /** The stable `_key` of the block; how a block is followed across versions. */
  readonly key: string
  readonly type: string
  readonly change: ChangeKind | 'moved'
  readonly fromIndex: number | null
  readonly toIndex: number | null
  /** Populated for `changed`: what changed inside the block. */
  readonly fields: readonly FieldChange[]
}

export interface ContentDiff {
  readonly fields: readonly FieldChange[]
  readonly blocks: readonly BlockChange[]
  readonly changed: boolean
}

/**
 * Structural equality, without a dependency (rule R9).
 *
 * Values here are JSON-shaped: what a field holds after decoding. Key order is
 * not significant, so `{a,b}` and `{b,a}` compare equal — a diff that reported
 * a change because the driver returned keys in another order would be noise.
 */
export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right) return false
  if (left === null || right === null) return false
  if (typeof left !== 'object' || typeof right !== 'object') return false

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    return left.every((item, index) => deepEqual(item, right[index]))
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])

  for (const key of keys) {
    if (!deepEqual(leftRecord[key], rightRecord[key])) return false
  }
  return true
}

/** Undefined and null both mean "no value"; only one of them is ever stored. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null
}

export function diffValues(before: ContentValues, after: ContentValues): FieldChange[] {
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  const changes: FieldChange[] = []

  for (const field of fields) {
    const from = before[field]
    const to = after[field]
    if (deepEqual(from, to)) continue

    const change: ChangeKind = isAbsent(from) ? 'added' : isAbsent(to) ? 'removed' : 'changed'
    changes.push({ field, change, before: from ?? null, after: to ?? null })
  }

  return changes
}

/**
 * Blocks are matched by `_key`, never by position.
 *
 * Matching by position would report an insertion at the top as "every block
 * changed". Matching by key reports one addition and a set of moves, which is
 * what actually happened.
 */
export function diffBlocks(
  zone: string,
  before: readonly ContentBlock[],
  after: readonly ContentBlock[],
): BlockChange[] {
  const beforeIndex = new Map(before.map((block, index) => [block.key, { block, index }]))
  const afterIndex = new Map(after.map((block, index) => [block.key, { block, index }]))
  const changes: BlockChange[] = []

  for (const [key, { block, index }] of beforeIndex) {
    if (afterIndex.has(key)) continue
    changes.push({
      zone,
      key,
      type: block.type,
      change: 'removed',
      fromIndex: index,
      toIndex: null,
      fields: [],
    })
  }

  for (const [key, { block, index }] of afterIndex) {
    const previous = beforeIndex.get(key)

    if (previous === undefined) {
      changes.push({
        zone,
        key,
        type: block.type,
        change: 'added',
        fromIndex: null,
        toIndex: index,
        fields: [],
      })
      continue
    }

    const fields = diffValues(previous.block.data, block.data)
    const retyped = previous.block.type !== block.type

    if (fields.length > 0 || retyped) {
      changes.push({
        zone,
        key,
        type: block.type,
        change: 'changed',
        fromIndex: previous.index,
        toIndex: index,
        fields,
      })
    } else if (previous.index !== index) {
      changes.push({
        zone,
        key,
        type: block.type,
        change: 'moved',
        fromIndex: previous.index,
        toIndex: index,
        fields: [],
      })
    }
  }

  return changes.sort(
    (left, right) =>
      (left.toIndex ?? left.fromIndex ?? 0) - (right.toIndex ?? right.fromIndex ?? 0),
  )
}

export function diffBlockZones(before: BlockZones, after: BlockZones): BlockChange[] {
  const zones = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return zones.flatMap((zone) => diffBlocks(zone, before[zone] ?? [], after[zone] ?? []))
}

export function diffContent(
  before: { readonly values: ContentValues; readonly blocks: BlockZones },
  after: { readonly values: ContentValues; readonly blocks: BlockZones },
): ContentDiff {
  const fields = diffValues(before.values, after.values)
  const blocks = diffBlockZones(before.blocks, after.blocks)
  return { fields, blocks, changed: fields.length > 0 || blocks.length > 0 }
}

/**
 * Word-level diff, task 06-3 ("un mot corrigé apparaît comme un mot corrigé,
 * pas « changé »"). A "word" is a maximal run of non-whitespace, or a maximal
 * run of whitespace — so the reconstruction of either side is exactly
 * `words.map(w => w.text).join('')`, whitespace included. `Array.from`-free by
 * construction: the `u` flag makes `\S`/`\s` match by code point, so an
 * astral character (outside the BMP) is one token, never a lone surrogate.
 */
export type WordOp = 'equal' | 'added' | 'removed'

export interface WordChange {
  readonly op: WordOp
  readonly text: string
}

function tokenizeWords(text: string): readonly string[] {
  return text.match(/\s+|\S+/gu) ?? []
}

/** Bounds are the loop invariant's job here, not the type checker's — this is
 * the one place that turns "the invariant holds" into a value the compiler
 * accepts, without a non-null assertion (R9's neighbour rule: no unchecked
 * escape hatch in library code). */
function wordAt(words: readonly string[], index: number): string {
  const word = words[index]
  if (word === undefined) {
    throw new CogentaError({
      code: 'INTERNAL',
      message: 'diffWords walked past the end of a tokenised side.',
      hint: 'This is a bug in diffWords — its own loop bounds should make this unreachable.',
    })
  }
  return word
}

function lcsLength(table: readonly Int32Array[], i: number, j: number): number {
  return table[i]?.[j] ?? 0
}

/**
 * Longest common subsequence of words, walked into a left-to-right script of
 * equal/removed/added runs. Plain dynamic programming, ~30 lines — R9: no
 * diff library for this.
 */
export function diffWords(before: string, after: string): readonly WordChange[] {
  const a = tokenizeWords(before)
  const b = tokenizeWords(after)
  const n = a.length
  const m = b.length

  // lcs[i][j] = length of the LCS of a[i:] and b[j:]. One row per position in
  // `a`, so each row is a flat, single-indexed `Int32Array` — no 2D access
  // ever needs its own non-null assertion.
  const lcs: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    const row = lcs[i] as Int32Array
    for (let j = m - 1; j >= 0; j--) {
      row[j] =
        a[i] === b[j]
          ? lcsLength(lcs, i + 1, j + 1) + 1
          : Math.max(lcsLength(lcs, i + 1, j), lcsLength(lcs, i, j + 1))
    }
  }

  const ops: WordChange[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: 'equal', text: wordAt(a, i) })
      i++
      j++
    } else if (lcsLength(lcs, i + 1, j) >= lcsLength(lcs, i, j + 1)) {
      ops.push({ op: 'removed', text: wordAt(a, i) })
      i++
    } else {
      ops.push({ op: 'added', text: wordAt(b, j) })
      j++
    }
  }
  while (i < n) {
    ops.push({ op: 'removed', text: wordAt(a, i) })
    i++
  }
  while (j < m) {
    ops.push({ op: 'added', text: wordAt(b, j) })
    j++
  }

  // Merge adjacent same-op runs, so "un mot" -> "un gros mot" reports one
  // insertion of "gros " rather than a token at a time.
  const merged: WordChange[] = []
  for (const op of ops) {
    const last = merged.at(-1)
    if (last !== undefined && last.op === op.op) {
      merged[merged.length - 1] = { op: last.op, text: last.text + op.text }
    } else {
      merged.push(op)
    }
  }
  return merged
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Plain text out of a `text` field (a string, returned as-is) or a `richText`
 * document (contract A: an array of `block`/`media` nodes — `@cogenta/blocks`'s
 * `richTextDocumentSchema`). Returns `null` for anything else, including a
 * shape that merely looks like a document — the piège this file's own
 * comment warns about: "le portable-text est un arbre; comparer
 * `JSON.stringify` produit du bruit", so an unrecognised node refuses rather
 * than guesses.
 */
export function extractPlainText(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return null

  const parts: string[] = []
  for (const node of value) {
    if (!isRecord(node)) return null
    if (node._type === 'media') continue
    if (node._type !== 'block' || !Array.isArray(node.children)) return null

    for (const child of node.children) {
      if (!isRecord(child) || typeof child.text !== 'string') return null
      parts.push(child.text)
    }
    parts.push('\n')
  }
  return parts.join('')
}

/**
 * Attaches a word-level diff to every `changed` field whose two sides both
 * extract to plain text — never to `added`/`removed` fields (there is only
 * one side to show) and never in place: `diffValues`/`diffContent` stay
 * exactly as every existing caller already relies on them being.
 */
function enrichFieldChanges(fields: readonly FieldChange[]): readonly FieldChange[] {
  return fields.map((change) => {
    if (change.change !== 'changed') return change
    const before = extractPlainText(change.before)
    const after = extractPlainText(change.after)
    if (before === null || after === null || before === after) return change
    return { ...change, words: diffWords(before, after) }
  })
}

/** Same enrichment, walked into every block's own field changes as well. */
export function enrichWordDiffs(diff: ContentDiff): ContentDiff {
  return {
    ...diff,
    fields: enrichFieldChanges(diff.fields),
    blocks: diff.blocks.map((block) => ({ ...block, fields: enrichFieldChanges(block.fields) })),
  }
}
