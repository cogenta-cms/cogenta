import {
  buildManifest,
  createMemoryApprovalQueue,
  createToolRegistry,
  defineTool,
  type ToolContext,
  withAutonomyForManifest,
} from '@cogenta/agents'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { developerAgent } from '../../src/developer/agent.js'
import { createCodePatchTool } from '../../src/developer/patch-tool.js'
import type { PrClient } from '../../src/security/pr-client.js'

describe('developerAgent — declared scope', () => {
  it('is a frozen, valid AgentDeclaration', () => {
    expect(Object.isFrozen(developerAgent)).toBe(true)
    expect(developerAgent.name).toBe('developer')
  })

  it('grants only schema.read, site.config_read and code.propose_patch', () => {
    expect(developerAgent.tools).toEqual(['schema.read', 'site.config_read', 'code.propose_patch'])
  })

  it('never lists a content-writing or deployment tool', () => {
    for (const forbidden of [
      'content.write_draft',
      'content.publish',
      'content.delete',
      'deps.patch',
      'build.trigger',
      'deploy.trigger',
      'site.config_write',
    ]) {
      expect(developerAgent.tools).not.toContain(forbidden)
    }
  })

  it('never overrides code.propose_patch to autonomous — a code change always waits for a human', () => {
    expect(developerAgent.autonomy?.default).toBe('propose')
    expect(developerAgent.autonomy?.overrides?.['code.propose_patch']).toBeUndefined()
    expect(
      Object.values(developerAgent.autonomy?.overrides ?? {}).some(
        (level) => level === 'autonomous',
      ),
    ).toBe(false)
  })
})

const CONTEXT: Omit<ToolContext, 'signal'> = {
  site: { name: 'acme', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:developer', roles: ['admin', 'agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
}

function fakePrClient(): PrClient & { opened: number } {
  return {
    opened: 0,
    async open() {
      this.opened += 1
      return { url: 'https://example.invalid/pr/1', number: 1 }
    },
    async close() {
      // unused by these tests
    },
  }
}

/** Minimal stand-ins for `schema.read`/`site.config_read` so the registry can resolve every name `developerAgent.tools` declares — these two are read-only and irrelevant to the autonomy assertions below, only `code.propose_patch` is. */
function readOnlyStub(name: string, permission: string) {
  return defineTool({
    name,
    version: '1.0.0',
    description: `Read-only stub for ${name}.`,
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    permissions: [permission],
    sideEffects: false,
    reversible: false,
    cost: 'low' as const,
    execute: async () => ({ ok: true }),
  })
}

/** A tool outside `developerAgent.tools` — stands in for a real one (e.g. content.publish) to prove the manifest never surfaces it. */
const outOfScopeTool = defineTool({
  name: 'content.publish',
  version: '1.0.0',
  description: 'Publish content — never granted to the developer agent.',
  input: z.object({ id: z.string() }),
  output: z.object({ url: z.string() }),
  permissions: ['content.publish'],
  sideEffects: true,
  reversible: false,
  cost: 'low' as const,
  execute: async (input) => ({ url: `/entries/${input.id}` }),
})

describe('developerAgent — runtime enforcement, not just declaration', () => {
  it('never builds an ExecutableTool for a tool outside its declared list, even when the registry has it', () => {
    const prClient = fakePrClient()
    const codePatch = createCodePatchTool({ prClient })
    const registry = createToolRegistry([
      codePatch,
      readOnlyStub('schema.read', 'schema.read'),
      readOnlyStub('site.config_read', 'site.config_read'),
      outOfScopeTool,
    ])

    // A hallucinated or prompt-injected call to "content.publish" has nothing to
    // resolve against: buildManifest only ever builds what agent.tools names.
    const manifest = buildManifest(registry, developerAgent.tools, CONTEXT)

    expect(manifest.map((t) => t.spec.name)).toEqual(developerAgent.tools)
    expect(manifest.some((t) => t.spec.name === 'content.publish')).toBe(false)
  })

  it('throws TOOL_UNKNOWN, at build time, if an attacker-controlled tool name were ever added to the agent config', () => {
    const prClient = fakePrClient()
    const codePatch = createCodePatchTool({ prClient })
    const registry = createToolRegistry([
      codePatch,
      readOnlyStub('schema.read', 'schema.read'),
      readOnlyStub('site.config_read', 'site.config_read'),
    ])

    expect(() =>
      buildManifest(registry, [...developerAgent.tools, 'deploy.trigger'], CONTEXT),
    ).toThrowError(/"deploy.trigger"/)
  })

  it('withAutonomy at the agent’s propose default never calls code.propose_patch — it only queues a request, PrClient.open is never reached', async () => {
    const prClient = fakePrClient()
    const codePatch = createCodePatchTool({ prClient })
    const registry = createToolRegistry([
      codePatch,
      readOnlyStub('schema.read', 'schema.read'),
      readOnlyStub('site.config_read', 'site.config_read'),
    ])
    const manifest = buildManifest(registry, developerAgent.tools, CONTEXT)
    const gated = withAutonomyForManifest(manifest, {
      agentName: developerAgent.name,
      autonomy: developerAgent.autonomy ?? { default: 'propose' },
      approvalQueue: createMemoryApprovalQueue(),
    })

    const patchTool = gated.find((t) => t.spec.name === 'code.propose_patch')
    expect(patchTool).toBeDefined()

    const controller = new AbortController()
    const result = await patchTool?.execute(
      {
        summary: 'add a new field',
        rationale: 'the site owner asked for it',
        files: [{ path: 'packages/schema/src/example.ts', content: '// change' }],
        testPlan: 'pnpm -F @cogenta/schema test',
      },
      { signal: controller.signal },
    )

    expect(result).toMatchObject({ proposed: true })
    expect(prClient.opened).toBe(0)
  })

  it('a direct call to the underlying tool, bypassing withAutonomy entirely, is the only way a PR gets opened — proving the gate is what stands between the agent and any real effect', async () => {
    const prClient = fakePrClient()
    const codePatch = createCodePatchTool({ prClient })
    const registry = createToolRegistry([
      codePatch,
      readOnlyStub('schema.read', 'schema.read'),
      readOnlyStub('site.config_read', 'site.config_read'),
    ])
    const manifest = buildManifest(registry, developerAgent.tools, CONTEXT)
    const raw = manifest.find((t) => t.spec.name === 'code.propose_patch')
    const controller = new AbortController()

    await raw?.execute(
      {
        summary: 'add a new field',
        rationale: 'the site owner asked for it',
        files: [{ path: 'packages/schema/src/example.ts', content: '// change' }],
        testPlan: 'pnpm -F @cogenta/schema test',
      },
      { signal: controller.signal },
    )

    // This only proves what withAutonomy prevents above: the raw manifest tool
    // (never handed to a model without the autonomy wrapper in
    // `orchestrator.ts`'s real wiring) does call PrClient.open. The agent's
    // actual runtime path always goes through withAutonomyForManifest first.
    expect(prClient.opened).toBe(1)
  })
})
