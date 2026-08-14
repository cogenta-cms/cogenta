import type { ToolContext } from '@cogenta/agents'
import { describe, expect, it, vi } from 'vitest'
import { createDepsPatchTool } from '../../src/security/deps-patch-tool.js'
import type { OpenPrOptions, PrClient } from '../../src/security/pr-client.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:security', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function fakePrClient(overrides: Partial<PrClient> = {}): PrClient {
  return {
    open: vi.fn(async () => ({ url: 'https://github.com/acme/site/pull/1', number: 1 })),
    close: vi.fn(async () => undefined),
    ...overrides,
  }
}

const INPUT = {
  package: 'lodash',
  currentVersion: '4.17.15',
  fixedVersion: '4.17.21',
  dependencyFilePath: 'package.json',
  dependencyFileContent: '{"dependencies": {"lodash": "4.17.15"}}',
  findingSummary: 'Prototype pollution, actively exploited.',
}

describe('deps.patch', () => {
  it('declares its permission, side effects and reversibility', () => {
    const tool = createDepsPatchTool({ prClient: fakePrClient() })
    expect(tool.permissions).toEqual(['deps.patch'])
    expect(tool.sideEffects).toBe(true)
    expect(tool.reversible).toBe(true)
  })

  it('opens a PR with the bumped dependency file, never modifying anything directly', async () => {
    const open = vi.fn(async (_options: OpenPrOptions) => ({
      url: 'https://github.com/acme/site/pull/1',
      number: 1,
    }))
    const prClient = fakePrClient({ open })
    const tool = createDepsPatchTool({ prClient })

    const output = await tool.execute(INPUT, CTX)

    expect(output).toEqual({ prUrl: 'https://github.com/acme/site/pull/1', prNumber: 1 })
    expect(open).toHaveBeenCalledTimes(1)
    const callArgs = open.mock.calls[0]?.[0]
    expect(callArgs?.files).toEqual([
      { path: 'package.json', content: '{"dependencies": {"lodash": "4.17.21"}}' },
    ])
    expect(callArgs?.title).toContain('lodash')
    expect(callArgs?.title).toContain('4.17.21')
    expect(callArgs?.body).toContain(INPUT.findingSummary)
  })

  it('defaults the base branch to main, overridable', async () => {
    const open = vi.fn(async (_options: OpenPrOptions) => ({ url: 'x', number: 1 }))
    await createDepsPatchTool({ prClient: fakePrClient({ open }) }).execute(INPUT, CTX)
    expect(open.mock.calls[0]?.[0]?.baseBranch).toBe('main')

    const open2 = vi.fn(async (_options: OpenPrOptions) => ({ url: 'x', number: 1 }))
    await createDepsPatchTool({
      prClient: fakePrClient({ open: open2 }),
      baseBranch: 'develop',
    }).execute(INPUT, CTX)
    expect(open2.mock.calls[0]?.[0]?.baseBranch).toBe('develop')
  })

  it('revert() closes the PR by number, without merging it', async () => {
    const close = vi.fn(async () => undefined)
    const tool = createDepsPatchTool({ prClient: fakePrClient({ close }) })

    await tool.revert?.({ prUrl: 'x', prNumber: 42 }, CTX)

    expect(close).toHaveBeenCalledWith(42)
  })
})
