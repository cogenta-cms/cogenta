import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createBlock, ctaBlock, heroBlock, proseBlock, quoteBlock } from '../src/index.js'
import { paragraph } from './fixtures.js'

/**
 * Rule R3: a block stores semantic data. Never HTML, never a CSS class, never a
 * style value. These are the shapes that get through when nobody checks.
 */
describe('rule R3 — a block never stores presentation', () => {
  it('refuses HTML markup in a text field', () => {
    expect(() =>
      createBlock(heroBlock, 'k', { title: 'A site that <em>runs itself</em>' }),
    ).toThrowError(/plain text/)
  })

  it('refuses HTML markup inside a rich text span', () => {
    expect(() =>
      createBlock(proseBlock, 'k', { body: paragraph('<p class="lead">Hello</p>') }),
    ).toThrowError(/plain text/)
  })

  it('refuses a CSS class smuggled in as an extra field', () => {
    try {
      createBlock(heroBlock, 'k', { title: 'Fine', className: 'hero--dark' })
      expect.unreachable('an unrecognised field must be refused')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(error.code).toBe('BLOCK_INVALID')
      expect(error.details?.fields).toContain('className')
    }
  })

  it('refuses a style value smuggled in as an extra field', () => {
    expect(() =>
      createBlock(quoteBlock, 'k', { text: 'Fine', style: 'font-size: 2rem' }),
    ).toThrowError(/style/)
  })

  it('keeps emphasis as an intent, and refuses anything outside the two it allows', () => {
    const ok = createBlock(ctaBlock, 'k', {
      title: 'Try it',
      actions: [
        { label: 'Install', target: { href: 'https://example.org' }, emphasis: 'secondary' },
      ],
    })
    expect(ok.actions[0]?.emphasis).toBe('secondary')

    expect(() =>
      createBlock(ctaBlock, 'k', {
        title: 'Try it',
        actions: [
          { label: 'Install', target: { href: 'https://example.org' }, emphasis: 'btn-lg' },
        ],
      }),
    ).toThrowError(/emphasis/)
  })

  it('accepts text a human actually writes, comparisons included', () => {
    const block = createBlock(quoteBlock, 'k', { text: 'It took a < b milliseconds, 5 > 3.' })
    expect(block.text).toContain('a < b')
  })
})
