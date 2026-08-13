import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { parseBlocks, safeParseBlock } from '../src/index.js'
import { VALID_DATA } from './fixtures.js'

function placed(key: string, type: string): Record<string, unknown> {
  return { ...VALID_DATA[type], _key: key, _type: type, _version: '1.0.0' }
}

describe('block identity', () => {
  it('keeps every _key through a reorder of the zone', () => {
    const zone = [placed('a', 'hero'), placed('b', 'prose'), placed('c', 'cta')]
    const keys = parseBlocks(zone).map((block) => block._key)
    const reordered = parseBlocks([zone[2], zone[0], zone[1]]).map((block) => block._key)

    expect(keys).toEqual(['a', 'b', 'c'])
    expect(reordered).toEqual(['c', 'a', 'b'])
    expect([...reordered].sort()).toEqual(keys)
  })

  it('keeps a _key through a translation, since only the values change', () => {
    const source = placed('a', 'quote')
    const translated = { ...source, text: 'Il se réparait avant que je lise l’alerte.' }
    const [original, copy] = parseBlocks([source, { ...translated, _key: 'a-fr' }])

    expect(original?._key).toBe('a')
    expect(copy?._key).toBe('a-fr')
    // A translation family keeps the key of its source when it is restored in
    // place; here the two coexist, which the zone must allow.
    expect(parseBlocks([source]).at(0)?._key).toBe('a')
  })

  it('refuses an empty _key, because an unaddressable block cannot be diffed', () => {
    const outcome = safeParseBlock({ ...placed('', 'prose') })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.code).toBe('BLOCK_INVALID')
  })

  it('refuses two blocks sharing a _key in the same zone', () => {
    try {
      parseBlocks([placed('same', 'hero'), placed('same', 'prose')])
      expect.unreachable('a duplicate key must be refused')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(error.code).toBe('BLOCK_INVALID')
      expect(error.message).toContain('duplicate block key')
    }
  })

  it('keeps the _key of every item of a repeated field', () => {
    const [grid] = parseBlocks([placed('g', 'featureGrid')])
    const items = grid?.items
    expect(Array.isArray(items)).toBe(true)
    expect((items as { _key: string }[]).map((item) => item._key)).toEqual(['f1', 'f2'])
  })

  it('reports the failure instead of throwing when asked to', () => {
    const outcome = safeParseBlock({ _key: 'k', _type: 'hero', _version: '1.0.0' })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('BLOCK_INVALID')
      expect(outcome.error.details?.block).toBe('hero')
    }
  })
})
