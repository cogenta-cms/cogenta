import type { ContentBlock } from '../api/content-client.js'
import type { Pattern } from '../api/patterns-client.js'
import { blockDefinition, freshBlockKey } from '../blocks/vocabulary.js'

/**
 * Pure logic over the pattern/model library (fiche 43 sub-chantier A; fiche
 * 05 task 1), kept apart from the picker component for the same reason
 * `block-moves.ts` is: it is what a test exercises without a DOM, and it is
 * the only place that decides what inserting a pattern is allowed to do to
 * the page's block list.
 *
 * A pattern is never a thirteenth block type (fiche 05's own pitfall, §7):
 * every function here produces or consumes an ordinary `ContentBlock[]`,
 * exactly the shape `insertBlock`/`pasteBlocks` already work with. Inserting
 * a pattern is indistinguishable, once committed, from placing the same
 * blocks by hand — including getting a *fresh* key per block, never the
 * pattern's own stored keys, so the same pattern can be inserted twice on
 * one page without a key collision.
 */

/**
 * Inserts a motif's blocks at `at`, added to whatever the zone already has.
 *
 * Returns the keys it minted too — the same shape `insertBlock`
 * (`block-moves.ts`) returns its one key in, for the same reason: the caller
 * selects what was just added, so an editor sees it land rather than having
 * to scroll and guess.
 */
export function insertPatternBlocks(
  blocks: readonly ContentBlock[],
  pattern: Pattern,
  at: number,
): { readonly blocks: readonly ContentBlock[]; readonly keys: readonly string[] } {
  const fresh = pattern.blocks.map((block) => ({ ...block, key: freshBlockKey() }))
  const next = [...blocks]
  next.splice(Math.max(0, Math.min(at, blocks.length)), 0, ...fresh)
  return { blocks: next, keys: fresh.map((block) => block.key) }
}

/**
 * A modèle de page complet's blocks, replacing the whole zone.
 *
 * Deliberately just a pure function that produces the new list — the caller
 * (`PageBuilder`) is the one that must ask for explicit confirmation before
 * committing it (fiche 43 §5's own acceptance criterion: "jamais
 * silencieusement"). Nothing here decides that on its own.
 */
export function applyTemplateBlocks(pattern: Pattern): readonly ContentBlock[] {
  return pattern.blocks.map((block) => ({ ...block, key: freshBlockKey() }))
}

// ---- Import/export (fiche 43 sub-chantier F) -------------------------------

/** The file format `exportPatternFile`/`parsePatternFile` round-trip. Versioned so a future shape change can tell an old file apart. */
export const PATTERN_FILE_FORMAT = 'cogenta/pattern-file@1'

export interface PatternFileEntry {
  readonly name: string
  readonly category: string | null
  readonly kind: Pattern['kind']
  readonly blocks: readonly ContentBlock[]
  readonly provenance: Pattern['provenance']
  readonly provenanceDetail: Pattern['provenanceDetail']
}

export interface PatternFile {
  readonly format: typeof PATTERN_FILE_FORMAT
  readonly patterns: readonly PatternFileEntry[]
}

/** Serialises a library (or a selection of it) to the exchange format — never HTML/CSS, only the same `{key,type,data}` blocks every other export in this admin already carries. */
export function exportPatternFile(patterns: readonly Pattern[]): PatternFile {
  return {
    format: PATTERN_FILE_FORMAT,
    patterns: patterns.map((pattern) => ({
      name: pattern.name,
      category: pattern.category,
      kind: pattern.kind,
      blocks: pattern.blocks,
      provenance: pattern.provenance,
      provenanceDetail: pattern.provenanceDetail,
    })),
  }
}

export type ParsePatternFileResult =
  | { readonly ok: true; readonly entries: readonly PatternFileEntry[] }
  | { readonly ok: false; readonly reason: 'not-json' | 'wrong-format' | 'malformed' }
  | { readonly ok: false; readonly reason: 'unknown-block-type'; readonly type: string }

/**
 * Parses and validates an imported file, refusing rather than guessing —
 * the same discipline `parseClipboardBlocks` (`block-moves.ts`) applies to a
 * paste, extended here to a whole file: one entry with one unknown block
 * type fails the *whole* import, never a partial one silently missing a
 * block (fiche 43 §5's "jamais de HTML/CSS caché" reasoning applies just as
 * much to "jamais un bloc disparu sans le dire").
 */
export function parsePatternFile(text: string): ParsePatternFileResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'not-json' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'malformed' }
  }
  const record = parsed as Record<string, unknown>
  if (record.format !== PATTERN_FILE_FORMAT) return { ok: false, reason: 'wrong-format' }

  const rawPatterns = record.patterns
  if (!Array.isArray(rawPatterns) || rawPatterns.length === 0) {
    return { ok: false, reason: 'malformed' }
  }

  const entries: PatternFileEntry[] = []
  for (const raw of rawPatterns) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'malformed' }
    const entry = raw as Record<string, unknown>
    const name = entry.name
    const kind = entry.kind
    const blocks = entry.blocks
    if (typeof name !== 'string' || name.length === 0) return { ok: false, reason: 'malformed' }
    if (kind !== 'pattern' && kind !== 'template') return { ok: false, reason: 'malformed' }
    if (!Array.isArray(blocks) || blocks.length === 0) return { ok: false, reason: 'malformed' }

    const typedBlocks: ContentBlock[] = []
    for (const rawBlock of blocks) {
      if (typeof rawBlock !== 'object' || rawBlock === null)
        return { ok: false, reason: 'malformed' }
      const block = rawBlock as Record<string, unknown>
      const key = block.key
      const type = block.type
      if (typeof key !== 'string' || key.length === 0) return { ok: false, reason: 'malformed' }
      if (typeof type !== 'string' || type.length === 0) return { ok: false, reason: 'malformed' }
      if (blockDefinition(type) === undefined)
        return { ok: false, reason: 'unknown-block-type', type }
      const data = block.data
      typedBlocks.push({
        key,
        type,
        data: (data ?? {}) as Readonly<Record<string, unknown>>,
      })
    }

    const category = entry.category
    const provenance = entry.provenance
    const provenanceDetail = entry.provenanceDetail
    entries.push({
      name,
      category: typeof category === 'string' ? category : null,
      kind,
      blocks: typedBlocks,
      provenance:
        provenance === 'human' || provenance === 'assisted' || provenance === 'generated'
          ? provenance
          : 'human',
      provenanceDetail:
        typeof provenanceDetail === 'object' && provenanceDetail !== null
          ? (provenanceDetail as PatternFileEntry['provenanceDetail'])
          : null,
    })
  }

  return { ok: true, entries }
}
