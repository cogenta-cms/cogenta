import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTool } from '../../src/tools/define.js'
import { createToolRegistry } from '../../src/tools/registry.js'

function tool(name: string) {
  return defineTool({
    name,
    version: '1.0.0',
    description: name,
    input: z.object({}),
    output: z.object({}),
    permissions: ['content.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low' as const,
    execute: async () => ({}),
  })
}

describe('createToolRegistry', () => {
  it('lists every registered tool and finds one by name', () => {
    const registry = createToolRegistry([tool('a'), tool('b')])

    expect(registry.list().map((t) => t.name)).toEqual(['a', 'b'])
    expect(registry.get('a')?.name).toBe('a')
    expect(registry.get('missing')).toBeUndefined()
  })

  it('refuses two tools registered under the same name', () => {
    expect(() => createToolRegistry([tool('a'), tool('a')])).toThrowError(
      /Two tools are registered under the name "a"/,
    )
  })

  it('is empty when given no tools', () => {
    expect(createToolRegistry([]).list()).toEqual([])
  })
})
