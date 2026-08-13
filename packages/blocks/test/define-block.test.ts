import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  type AnyBlockDefinition,
  createBlockRegistry,
  defineBlock,
  f,
  parseBlock,
} from '../src/index.js'

/** A block a theme ships of its own: it must name a fallback. */
const pullQuote = defineBlock({
  name: 'themePullQuote',
  version: '1.0.0',
  runtime: 'static',
  fallback: 'quote',
  a11y: { headingLevel: 'none' },
  schema: { text: f.text({ required: true }) },
})

describe('defineBlock', () => {
  it('produces the manifest contract B describes', () => {
    expect(pullQuote.name).toBe('themePullQuote')
    expect(pullQuote.version).toBe('1.0.0')
    expect(pullQuote.runtime).toBe('static')
    expect(pullQuote.fallback).toBe('quote')
    expect(pullQuote.a11y.headingLevel).toBe('none')
    expect(Object.keys(pullQuote.schema)).toEqual(['text'])
  })

  it('refuses a version that is not major.minor.patch', () => {
    expect(() =>
      defineBlock({
        name: 'broken',
        version: '1.0',
        runtime: 'static',
        fallback: null,
        a11y: { headingLevel: 'none' },
        schema: {},
      }),
    ).toThrowError(/not a major.minor.patch version/)
  })

  it('refuses a field that shadows the envelope', () => {
    try {
      defineBlock({
        name: 'broken',
        version: '1.0.0',
        runtime: 'static',
        fallback: null,
        a11y: { headingLevel: 'none' },
        schema: { _key: f.text() },
      })
      expect.unreachable('a reserved field name must be refused')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(error.code).toBe('BLOCK_DEFINITION_INVALID')
    }
  })

  it('refuses a block that falls back on itself', () => {
    expect(() =>
      defineBlock({
        name: 'loop',
        version: '1.0.0',
        runtime: 'static',
        fallback: 'loop',
        a11y: { headingLevel: 'none' },
        schema: {},
      }),
    ).toThrowError(/fallback/)
  })

  it('refuses a runtime outside static, server and edge', () => {
    expect(() =>
      defineBlock({
        name: 'broken',
        version: '1.0.0',
        // Cast: this is what a JavaScript caller reaches this code with.
        runtime: 'worker' as 'static',
        fallback: null,
        a11y: { headingLevel: 'none' },
        schema: {},
      }),
    ).toThrowError(/runtime/)
  })
})

describe('a theme block and its fallback', () => {
  const registry = createBlockRegistry()
  registry.register(pullQuote as AnyBlockDefinition)

  it('validates against its own schema once registered', () => {
    const block = parseBlock(
      {
        _key: 'k1',
        _type: 'themePullQuote',
        _version: '1.0.0',
        text: 'Short and loud.',
      },
      registry,
    )
    expect(block._type).toBe('themePullQuote')
  })

  it('falls back to a vocabulary block a theme that ignores it does implement', () => {
    const implemented = ['hero', 'prose', 'quote']
    expect(registry.resolveRenderable('themePullQuote', implemented)?.name).toBe('quote')
    expect(registry.resolveRenderable('quote', implemented)?.name).toBe('quote')
  })

  it('reports that nothing in the chain is renderable rather than guessing', () => {
    expect(registry.resolveRenderable('themePullQuote', ['hero'])).toBeUndefined()
  })

  it('refuses to register a different block under a name already taken', () => {
    const other = defineBlock({
      name: 'themePullQuote',
      version: '2.0.0',
      runtime: 'static',
      fallback: 'quote',
      a11y: { headingLevel: 'none' },
      schema: {},
    })
    expect(() => registry.register(other as AnyBlockDefinition)).toThrowError(/already registered/)
  })

  it('names the known blocks when asked for one it does not have', () => {
    try {
      parseBlock({ _key: 'k', _type: 'carousel3d', _version: '1.0.0' }, registry)
      expect.unreachable('an unregistered block must be refused')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(error.code).toBe('BLOCK_UNKNOWN')
      expect(error.hint).toContain('hero')
    }
  })
})
