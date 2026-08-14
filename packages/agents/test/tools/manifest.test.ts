import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTool } from '../../src/tools/define.js'
import { buildManifest } from '../../src/tools/manifest.js'
import { createToolRegistry } from '../../src/tools/registry.js'
import type { ToolContext } from '../../src/tools/types.js'

const CONTEXT: Omit<ToolContext, 'signal'> = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:security', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
}

const publish = defineTool({
  name: 'content.publish',
  version: '1.0.0',
  description: 'Publish content.',
  input: z.object({ id: z.string() }),
  output: z.object({ url: z.string() }),
  permissions: ['content.publish'],
  sideEffects: true,
  reversible: false,
  cost: 'low' as const,
  execute: async (input, ctx) => {
    ctx.logger.info('publishing', { id: input.id })
    return { url: `/entries/${input.id}` }
  },
})

const scan = defineTool({
  name: 'deps.scan',
  version: '1.0.0',
  description: 'Scan dependencies.',
  input: z.object({}),
  output: z.object({ vulnerabilities: z.number() }),
  permissions: ['deps.scan'],
  sideEffects: false,
  reversible: false,
  cost: 'medium' as const,
  execute: async () => ({ vulnerabilities: 0 }),
})

describe('buildManifest', () => {
  it('builds one ExecutableTool per allowed name, in order', () => {
    const registry = createToolRegistry([publish, scan])
    const manifest = buildManifest(registry, ['deps.scan', 'content.publish'], CONTEXT)

    expect(manifest.map((t) => t.spec.name)).toEqual(['deps.scan', 'content.publish'])
  })

  it('never includes a tool the agent was not granted, even if the registry has it', () => {
    const registry = createToolRegistry([publish, scan])
    const manifest = buildManifest(registry, ['deps.scan'], CONTEXT)

    expect(manifest.some((t) => t.spec.name === 'content.publish')).toBe(false)
  })

  it('throws TOOL_UNKNOWN, at build time, when an allowed name is not in the registry', () => {
    const registry = createToolRegistry([publish])
    expect(() => buildManifest(registry, ['content.publish', 'ghost.tool'], CONTEXT)).toThrowError(
      /"ghost.tool"/,
    )
  })

  it('derives spec.inputSchema from the tool’s Zod input schema', () => {
    const registry = createToolRegistry([publish])
    const manifest = buildManifest(registry, ['content.publish'], CONTEXT)

    expect(manifest[0]?.spec.inputSchema).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' } },
    })
  })

  it('validates input against the schema before calling execute, rejecting a mismatch', async () => {
    const registry = createToolRegistry([publish])
    const manifest = buildManifest(registry, ['content.publish'], CONTEXT)
    const controller = new AbortController()

    await expect(
      manifest[0]?.execute({ id: 42 }, { signal: controller.signal }),
    ).rejects.toThrowError(/did not match its declared schema/)
  })

  it('runs execute and returns its validated output on a well-formed call', async () => {
    const registry = createToolRegistry([publish])
    const manifest = buildManifest(registry, ['content.publish'], CONTEXT)
    const controller = new AbortController()

    const result = await manifest[0]?.execute({ id: 'e1' }, { signal: controller.signal })
    expect(result).toEqual({ url: '/entries/e1' })
  })

  it('rejects when the tool returns a value that does not match its output schema', async () => {
    const badTool = defineTool({
      name: 'bad.tool',
      version: '1.0.0',
      description: 'Returns the wrong shape.',
      input: z.object({}),
      output: z.object({ url: z.string() }),
      permissions: ['content.read'],
      sideEffects: false,
      reversible: false,
      cost: 'low' as const,
      execute: async () => ({ url: 42 }) as unknown as { url: string },
    })
    const registry = createToolRegistry([badTool])
    const manifest = buildManifest(registry, ['bad.tool'], CONTEXT)
    const controller = new AbortController()

    await expect(manifest[0]?.execute({}, { signal: controller.signal })).rejects.toThrowError(
      /did not match its declared output schema/,
    )
  })

  it('threads the manifest-level context and the per-call signal into execute', async () => {
    let seenActorId: string | null = null
    let seenSignal: AbortSignal | undefined
    const echo = defineTool({
      name: 'echo',
      version: '1.0.0',
      description: 'Echoes context.',
      input: z.object({}),
      output: z.object({}),
      permissions: ['content.read'],
      sideEffects: false,
      reversible: false,
      cost: 'low' as const,
      execute: async (_input, ctx) => {
        seenActorId = ctx.actor.id
        seenSignal = ctx.signal
        return {}
      },
    })
    const registry = createToolRegistry([echo])
    const manifest = buildManifest(registry, ['echo'], CONTEXT)
    const controller = new AbortController()

    await manifest[0]?.execute({}, { signal: controller.signal })

    expect(seenActorId).toBe('agent:security')
    expect(seenSignal).toBe(controller.signal)
  })
})
