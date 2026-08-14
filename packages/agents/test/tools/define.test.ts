import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTool } from '../../src/tools/define.js'

const BASE = {
  name: 'content.publish',
  version: '1.0.0',
  description: 'Publish content.',
  input: z.object({ id: z.string() }),
  output: z.object({ url: z.string() }),
  permissions: ['content.publish'],
  cost: 'low' as const,
}

describe('defineTool', () => {
  it('returns the definition, frozen, when it is well-formed', () => {
    const tool = defineTool({
      ...BASE,
      sideEffects: true,
      reversible: true,
      execute: async () => ({ url: '/x' }),
      revert: async () => undefined,
    })

    expect(tool.name).toBe('content.publish')
    expect(Object.isFrozen(tool)).toBe(true)
  })

  it('accepts sideEffects without revert() when reversible is false', () => {
    expect(() =>
      defineTool({
        ...BASE,
        sideEffects: true,
        reversible: false,
        execute: async () => ({ url: '/x' }),
      }),
    ).not.toThrow()
  })

  it('rejects a sideEffects + reversible tool with no revert()', () => {
    expect(() =>
      defineTool({
        ...BASE,
        sideEffects: true,
        reversible: true,
        execute: async () => ({ url: '/x' }),
      }),
    ).toThrowError(/implements no revert/)
  })

  it('rejects a tool with no declared permissions', () => {
    expect(() =>
      defineTool({
        ...BASE,
        permissions: [],
        sideEffects: false,
        reversible: false,
        execute: async () => ({ url: '/x' }),
      }),
    ).toThrowError(/declares no permissions/)
  })

  it('allows a read-only tool (no side effects) with no revert()', () => {
    expect(() =>
      defineTool({
        ...BASE,
        sideEffects: false,
        reversible: false,
        execute: async () => ({ url: '/x' }),
      }),
    ).not.toThrow()
  })
})
