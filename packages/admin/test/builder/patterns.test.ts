import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '../../src/api/content-client.js'
import type { Pattern } from '../../src/api/patterns-client.js'
import {
  applyTemplateBlocks,
  exportPatternFile,
  insertPatternBlocks,
  PATTERN_FILE_FORMAT,
  parsePatternFile,
} from '../../src/builder/patterns.js'

const HERO_BLOCK: ContentBlock = { key: 'stored-1', type: 'hero', data: { title: 'Welcome' } }
const CTA_BLOCK: ContentBlock = { key: 'stored-2', type: 'cta', data: { title: 'Try it' } }

const HERO_PATTERN: Pattern = {
  id: 'pattern-1',
  name: 'Hero band',
  category: 'headers',
  kind: 'pattern',
  blocks: [HERO_BLOCK],
  provenance: 'human',
  provenanceDetail: null,
  createdAt: '2026-08-26T00:00:00.000Z',
  updatedAt: '2026-08-26T00:00:00.000Z',
}

const LANDING_TEMPLATE: Pattern = {
  ...HERO_PATTERN,
  id: 'pattern-2',
  name: 'Landing page',
  kind: 'template',
  blocks: [HERO_BLOCK, CTA_BLOCK],
}

const PAGE: readonly ContentBlock[] = [{ key: 'existing', type: 'prose', data: { body: [] } }]

describe('inserting a motif (fiche 43 sub-chantier A)', () => {
  it('adds the pattern’s blocks to whatever the page already has, with fresh keys', () => {
    const result = insertPatternBlocks(PAGE, HERO_PATTERN, 1)
    expect(result.blocks).toHaveLength(2)
    expect(result.blocks[1]?.type).toBe('hero')
    expect(result.blocks[1]?.key).not.toBe('stored-1')
    expect(result.keys).toEqual([result.blocks[1]?.key])
  })

  it('inserting the same pattern twice never collides on a key', () => {
    const first = insertPatternBlocks(PAGE, HERO_PATTERN, 0)
    const second = insertPatternBlocks(first.blocks, HERO_PATTERN, 0)
    expect(new Set(second.blocks.map((block) => block.key)).size).toBe(second.blocks.length)
  })

  it('never carries the pattern’s own data over untouched — only structure and content travel', () => {
    const result = insertPatternBlocks(PAGE, HERO_PATTERN, 0)
    expect(result.blocks[0]?.data).toEqual(HERO_BLOCK.data)
  })
})

describe('applying a full-page model (fiche 43 sub-chantier A)', () => {
  it('produces exactly the model’s blocks, never anything already on the page', () => {
    const blocks = applyTemplateBlocks(LANDING_TEMPLATE)
    expect(blocks.map((block) => block.type)).toEqual(['hero', 'cta'])
  })

  it('mints fresh keys rather than the template’s stored ones', () => {
    const blocks = applyTemplateBlocks(LANDING_TEMPLATE)
    expect(blocks[0]?.key).not.toBe('stored-1')
    expect(blocks[1]?.key).not.toBe('stored-2')
  })
})

describe('import/export round trip (fiche 43 sub-chantier F)', () => {
  it('exports and re-parses the library unchanged', () => {
    const file = exportPatternFile([HERO_PATTERN, LANDING_TEMPLATE])
    expect(file.format).toBe(PATTERN_FILE_FORMAT)

    const parsed = parsePatternFile(JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.entries).toHaveLength(2)
      expect(parsed.entries[0]?.name).toBe('Hero band')
      expect(parsed.entries[0]?.blocks).toEqual([HERO_BLOCK])
      expect(parsed.entries[1]?.kind).toBe('template')
    }
  })

  it('refuses a file that is not JSON', () => {
    expect(parsePatternFile('not json at all')).toEqual({ ok: false, reason: 'not-json' })
  })

  it('refuses a file with the wrong format marker', () => {
    const file = JSON.stringify({ format: 'something-else@1', patterns: [] })
    expect(parsePatternFile(file)).toEqual({ ok: false, reason: 'wrong-format' })
  })

  it('refuses a pattern whose block type this site does not declare, naming it', () => {
    const file = JSON.stringify({
      format: PATTERN_FILE_FORMAT,
      patterns: [
        {
          name: 'Broken',
          category: null,
          kind: 'pattern',
          blocks: [{ key: 'x', type: 'carousel-of-doom', data: {} }],
          provenance: 'human',
          provenanceDetail: null,
        },
      ],
    })
    expect(parsePatternFile(file)).toEqual({
      ok: false,
      reason: 'unknown-block-type',
      type: 'carousel-of-doom',
    })
  })

  it('defaults an unrecognised provenance to human rather than trusting the file', () => {
    const file = JSON.stringify({
      format: PATTERN_FILE_FORMAT,
      patterns: [
        {
          name: 'Hero band',
          category: null,
          kind: 'pattern',
          blocks: [HERO_BLOCK],
          provenance: 'not-a-real-value',
        },
      ],
    })
    const parsed = parsePatternFile(file)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.entries[0]?.provenance).toBe('human')
  })
})
