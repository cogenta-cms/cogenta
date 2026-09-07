import {
  buildManifest,
  type ChatRequest,
  type ChatResponse,
  createMemoryApprovalQueue,
  createToolRegistry,
  defineTool,
  type ProviderClient,
  type ToolContext,
  withAutonomyForManifest,
} from '@cogenta/agents'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { themeCreatorAgent } from '../../src/theme-creator/agent.js'
import { createProposeThemeTool } from '../../src/theme-creator/propose-theme-tool.js'
import { createWriteSandboxFileTool } from '../../src/theme-creator/write-sandbox-file-tool.js'

describe('themeCreatorAgent — declared scope', () => {
  it('is a frozen, valid AgentDeclaration', () => {
    expect(Object.isFrozen(themeCreatorAgent)).toBe(true)
    expect(themeCreatorAgent.name).toBe('theme-creator')
  })

  it('grants exactly theme.propose_theme and theme.write_sandbox_file, nothing else', () => {
    expect(themeCreatorAgent.tools).toEqual(['theme.propose_theme', 'theme.write_sandbox_file'])
  })

  it('never lists a content-writing or deployment tool', () => {
    for (const forbidden of [
      'content.write_draft',
      'content.publish',
      'content.delete',
      'deps.patch',
      'code.propose_patch',
      'build.trigger',
      'deploy.trigger',
      'site.config_write',
    ]) {
      expect(themeCreatorAgent.tools).not.toContain(forbidden)
    }
  })

  it('defaults to propose autonomy', () => {
    expect(themeCreatorAgent.autonomy?.default).toBe('propose')
  })
})

const CONTEXT: Omit<ToolContext, 'signal'> = {
  site: { name: 'acme', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:theme-creator', roles: ['admin', 'agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
}

const AVAILABLE_THEMES = [{ name: '@cogenta/theme-canonical', label: 'Canonical' }]

function fakeClient(): ProviderClient {
  let skinCallCount = 0
  return {
    name: 'fake',
    model: 'fake-model',
    maxOutputTokens: 8000,
    requestTimeoutMs: 180_000,
    maxCorrectionAttempts: 3,
    async chat(request: ChatRequest): Promise<ChatResponse> {
      const askText =
        typeof request.messages.at(-1)?.content === 'string'
          ? (request.messages.at(-1)?.content as string)
          : ''
      if (askText.includes('Available themes')) {
        return {
          content: JSON.stringify({
            themeName: '@cogenta/theme-canonical',
            rationale: 'Only one theme is installed.',
          }),
          toolCalls: [],
          stopReason: 'end_turn',
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      }
      // A `generateSkinCandidates` direction call — vary one leaf so distinct
      // directions never collide on the deduplication fingerprint.
      const tokens = {
        color: {
          bg: '#ffffff',
          fg: '#16181d',
          accent: '#1d4ed8',
          accentFg: '#ffffff',
          muted: '#f2f4f7',
          mutedFg: '#3f4655',
          border: '#d7dbe2',
        },
        font: {
          sans: 'ui-sans-serif, system-ui, sans-serif',
          serif: 'ui-serif, Georgia, serif',
          mono: 'ui-monospace, monospace',
          scale: 1.25,
          baseSize: '1rem',
        },
        space: { unit: '0.25rem', density: 'comfortable' },
        radius: { sm: `${1 + skinCallCount}px`, md: '0.5rem', lg: '1rem' },
        motion: { duration: '180ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
        shadow: { sm: '0 1px 2px rgba(22, 24, 29, 0.08)', md: '0 6px 24px rgba(22, 24, 29, 0.12)' },
      }
      skinCallCount++
      return {
        content: JSON.stringify(tokens),
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1 },
      }
    },
  }
}

/** Stand-in tool outside the agent's declared scope. */
const outOfScopeTool = defineTool({
  name: 'content.publish',
  version: '1.0.0',
  description: 'Publish content — never granted to the theme creator.',
  input: z.object({ id: z.string() }),
  output: z.object({ url: z.string() }),
  permissions: ['content.publish'],
  sideEffects: true,
  reversible: false,
  cost: 'low' as const,
  execute: async (input) => ({ url: `/entries/${input.id}` }),
})

describe('themeCreatorAgent — runtime enforcement', () => {
  it('never builds an ExecutableTool for a tool outside its declared list', () => {
    const tool = createProposeThemeTool({
      resolveProvider: async () => ({ client: fakeClient(), model: 'fake-model' }),
      availableThemes: AVAILABLE_THEMES,
    })
    const writeTool = createWriteSandboxFileTool({
      writeFile: async (input) => ({ path: input.path }),
      deleteFile: async () => undefined,
    })
    const registry = createToolRegistry([tool, writeTool, outOfScopeTool])

    const manifest = buildManifest(registry, themeCreatorAgent.tools, CONTEXT)

    expect(manifest.map((t) => t.spec.name)).toEqual(themeCreatorAgent.tools)
    expect(manifest.some((t) => t.spec.name === 'content.publish')).toBe(false)
  })

  it('runs immediately under withAutonomy — sideEffects: false leaves nothing to gate', async () => {
    const tool = createProposeThemeTool({
      resolveProvider: async () => ({ client: fakeClient(), model: 'fake-model' }),
      availableThemes: AVAILABLE_THEMES,
    })
    const writeTool = createWriteSandboxFileTool({
      writeFile: async (input) => ({ path: input.path }),
      deleteFile: async () => undefined,
    })
    const registry = createToolRegistry([tool, writeTool])
    const manifest = buildManifest(registry, themeCreatorAgent.tools, CONTEXT)
    const gated = withAutonomyForManifest(manifest, {
      agentName: themeCreatorAgent.name,
      autonomy: themeCreatorAgent.autonomy ?? { default: 'propose' },
      approvalQueue: createMemoryApprovalQueue(),
    })

    const proposeTool = gated.find((t) => t.spec.name === 'theme.propose_theme')
    expect(proposeTool).toBeDefined()

    const controller = new AbortController()
    const result = await proposeTool?.execute(
      { description: 'A cosy bakery site.', siteName: 'La Mie Dorée' },
      { signal: controller.signal },
    )

    // No "proposed: true" queueing envelope — the call actually ran.
    expect(result).toMatchObject({ ok: true })
  })

  it('decodes base64 attachments before they reach proposeThemeCandidates', async () => {
    const tool = createProposeThemeTool({
      resolveProvider: async () => ({ client: fakeClient(), model: 'fake-model' }),
      availableThemes: AVAILABLE_THEMES,
    })
    const controller = new AbortController()

    const result = await tool.execute(
      {
        description: 'A cosy bakery site.',
        siteName: 'La Mie Dorée',
        attachments: [
          {
            filename: 'brief.txt',
            mimeType: 'text/plain',
            dataBase64: Buffer.from('Warm colours, wood textures.', 'utf8').toString('base64'),
          },
        ],
      },
      { signal: controller.signal, ...CONTEXT },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates.length).toBeGreaterThan(0)
    for (const candidate of result.candidates) {
      expect(candidate.themeName).toBe('@cogenta/theme-canonical')
    }
  })
})

describe('theme.write_sandbox_file — fiche 73 task 7', () => {
  it('writes through the injected callback and returns the sandbox-relative path', async () => {
    const written: { sandboxId: string; path: string; content: string }[] = []
    const tool = createWriteSandboxFileTool({
      writeFile: async (input) => {
        written.push({ ...input })
        return { path: input.path }
      },
      deleteFile: async () => undefined,
    })

    const result = await tool.execute(
      { sandboxId: 'sbx-1', path: 'theme.render.mjs', content: 'export function renderPage() {}' },
      { ...CONTEXT, signal: new AbortController().signal },
    )

    expect(result).toEqual({ sandboxId: 'sbx-1', path: 'theme.render.mjs' })
    expect(written).toEqual([
      { sandboxId: 'sbx-1', path: 'theme.render.mjs', content: 'export function renderPage() {}' },
    ])
  })

  it('revert deletes exactly the file it wrote, nothing else', async () => {
    const deleted: { sandboxId: string; path: string }[] = []
    const tool = createWriteSandboxFileTool({
      writeFile: async (input) => ({ path: input.path }),
      deleteFile: async (input) => {
        deleted.push({ ...input })
      },
    })

    const receipt = await tool.execute(
      { sandboxId: 'sbx-2', path: 'theme.config.mjs', content: 'export default {}' },
      { ...CONTEXT, signal: new AbortController().signal },
    )
    expect(tool.revert).toBeDefined()
    await tool.revert?.(receipt, { ...CONTEXT, signal: new AbortController().signal })

    expect(deleted).toEqual([{ sandboxId: 'sbx-2', path: 'theme.config.mjs' }])
  })

  it('is sideEffects: true and reversible: true — unlike theme.propose_theme, withAutonomy actually gates it', async () => {
    const proposeTool = createProposeThemeTool({
      resolveProvider: async () => ({ client: fakeClient(), model: 'fake-model' }),
      availableThemes: AVAILABLE_THEMES,
    })
    const writeTool = createWriteSandboxFileTool({
      writeFile: async (input) => ({ path: input.path }),
      deleteFile: async () => undefined,
    })
    const registry = createToolRegistry([proposeTool, writeTool])
    const manifest = buildManifest(registry, themeCreatorAgent.tools, CONTEXT)
    const gated = withAutonomyForManifest(manifest, {
      agentName: themeCreatorAgent.name,
      autonomy: themeCreatorAgent.autonomy ?? { default: 'propose' },
      approvalQueue: createMemoryApprovalQueue(),
    })

    const gatedWriteTool = gated.find((t) => t.spec.name === 'theme.write_sandbox_file')
    expect(gatedWriteTool).toBeDefined()

    const controller = new AbortController()
    const result = await gatedWriteTool?.execute(
      { sandboxId: 'sbx-3', path: 'theme.render.mjs', content: 'export function renderPage() {}' },
      { signal: controller.signal },
    )

    // sideEffects: true + reversible: true under `propose` autonomy is
    // proposed, not executed — the real write callback above never runs
    // yet, the same forced-approval path every other reversible write tool
    // in this codebase already goes through.
    expect(result).toMatchObject({ proposed: true })
  })
})
