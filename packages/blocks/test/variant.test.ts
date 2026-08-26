import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { parseBlock, VOCABULARY, VOCABULARY_NAMES } from '../src/index.js'
import { VALID_DATA } from './fixtures.js'

/** Stamps the envelope the way the writer would, so `parseBlock` can dispatch. */
function place(name: string, data: Record<string, unknown>): Record<string, unknown> {
  return { ...data, _key: `key-${name}`, _type: name, _version: '1.0.0' }
}

/**
 * `blocks@2.0`, RFC 0002 — `variant` is part of the envelope, added once in
 * `defineBlock` rather than by each of the seventeen block schemas, so a
 * per-block loop is the right shape for this suite: a block that forgot to
 * carry it would only fail here, not in a single block's own test file.
 */
describe.each(VOCABULARY_NAMES)('%s carries the optional variant envelope', (name) => {
  it('accepts a block with no variant at all, unchanged from before blocks@2.0', () => {
    const data = VALID_DATA[name]
    if (data === undefined) return
    const block = parseBlock(place(name, data))
    expect(block.variant).toBeUndefined()
  })

  it('accepts a block whose variant sets only some axes', () => {
    const data = VALID_DATA[name]
    if (data === undefined) return
    const block = parseBlock(place(name, { ...data, variant: { background: 'muted' } }))
    expect(block.variant).toEqual({ background: 'muted' })
  })

  it('accepts a block whose variant sets every axis', () => {
    const data = VALID_DATA[name]
    if (data === undefined) return
    const variant = { background: 'image', spacing: 'spacious', align: 'end', width: 'full' }
    const block = parseBlock(place(name, { ...data, variant }))
    expect(block.variant).toEqual(variant)
  })

  it('refuses a variant value outside the closed token set, naming the block', () => {
    const data = VALID_DATA[name]
    if (data === undefined) return
    try {
      parseBlock(place(name, { ...data, variant: { background: 'crimson' } }))
      expect.unreachable('an out-of-vocabulary variant token must be refused')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(error.code).toBe('BLOCK_INVALID')
      expect(error.message).toContain(`"${name}"`)
    }
  })
})

describe('the variant envelope', () => {
  it('never appears inside a block schema itself — only on the envelope', () => {
    for (const block of VOCABULARY) {
      expect(Object.keys(block.schema)).not.toContain('variant')
    }
  })
})
