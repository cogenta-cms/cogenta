import { describe, expect, it } from 'vitest'
import { createAssistToolset } from '../../src/assist/toolset.js'
import { createAssistUsageTracker } from '../../src/assist/usage.js'
import { createFakeProvider, TEST_SITE, toolContext } from './fake-provider.js'

/**
 * Fiche 30 task 3: the toolset attributes real token usage to the tool that
 * spent it, and refuses to run a tool once the monthly cap is reached — a
 * refusal that happens *before* the provider is called, so a call already
 * over budget never spends another token.
 */
describe('assistant usage tracking', () => {
  it('attributes a completed call to the tool that made it', async () => {
    const provider = createFakeProvider('A rewritten passage.')
    const usage = createAssistUsageTracker({ limits: { monthlyTokenLimit: 1_000_000 } })
    const toolset = createAssistToolset({ provider, site: TEST_SITE, usage })

    expect(toolset.available).toBe(true)
    expect(toolset.model).toBe(provider.model)

    const rewrite = toolset.tools.find((tool) => tool.name === 'assist.rewrite')
    if (rewrite === undefined) throw new Error('assist.rewrite missing from toolset')

    await rewrite.execute({ text: 'Some text to rewrite.' }, toolContext())

    expect(usage.usage()).toMatchObject({
      tokensThisMonth: 20,
      byTool: [{ tool: 'assist.rewrite', calls: 1, tokens: 20 }],
    })
  })

  it('has no usage tracker at all with no provider — R2, nothing to meter', () => {
    const usage = createAssistUsageTracker()
    const toolset = createAssistToolset({ site: TEST_SITE, usage })

    expect(toolset.available).toBe(false)
    expect(toolset.usage).toBeUndefined()
  })
})
