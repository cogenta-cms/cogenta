import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createDocumentExtractTool } from '../../src/documents/extract-tool.js'
import type { ToolContext, ToolLogger } from '../../src/tools/types.js'

const CORPUS = join(fileURLToPath(new URL('.', import.meta.url)), 'corpus')

function recordingContext(): { ctx: ToolContext; logged: { message: string }[] } {
  const logged: { message: string }[] = []
  const logger: ToolLogger = {
    info: (message) => logged.push({ message }),
    warn: (message) => logged.push({ message }),
    error: (message) => logged.push({ message }),
  }
  return {
    ctx: {
      site: { name: 'new-site', locales: ['fr'], defaultLocale: 'fr' },
      actor: { id: 'user-1', roles: ['admin'] },
      logger,
      signal: new AbortController().signal,
    },
    logged,
  }
}

async function base64(filename: string): Promise<string> {
  return (await readFile(join(CORPUS, filename))).toString('base64')
}

describe('the document.extract_text tool', () => {
  it('declares itself as a read-only tool with an explicit permission', () => {
    const tool = createDocumentExtractTool()

    expect(tool.name).toBe('document.extract_text')
    expect(tool.permissions).toEqual(['document.extract'])
    expect(tool.sideEffects).toBe(false)
    expect(tool.revert).toBeUndefined()
  })

  it('returns text an agent can analyse, and logs what it read', async () => {
    const tool = createDocumentExtractTool()
    const { ctx, logged } = recordingContext()

    const result = await tool.execute(
      { filename: 'restaurant-brief.md', contentBase64: await base64('restaurant-brief.md') },
      ctx,
    )

    expect(result.format).toBe('markdown')
    expect(result.text).toContain('Pas de blog')
    expect(tool.output.parse(result)).toEqual(result)
    expect(logged).toHaveLength(1)
  })

  it('validates its own input schema before doing any work', () => {
    const tool = createDocumentExtractTool()

    expect(tool.input.safeParse({ filename: '', contentBase64: 'aGk=' }).success).toBe(false)
    expect(tool.input.safeParse({ filename: 'a.md', contentBase64: '' }).success).toBe(false)
    expect(tool.input.safeParse({ filename: 'a.md', contentBase64: 'aGk=' }).success).toBe(true)
  })

  it('surfaces the underlying refusal rather than swallowing it', async () => {
    const tool = createDocumentExtractTool()
    const { ctx } = recordingContext()

    await expect(
      tool.execute(
        { filename: 'scanned-menu.pdf', contentBase64: await base64('scanned-menu.pdf') },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'DOCUMENT_NO_TEXT_LAYER' })
  })
})
