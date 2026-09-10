import type { ChatRequest, ChatResponse, ProviderClient } from '@cogenta/agents'
import { describe, expect, it } from 'vitest'
import { generateSandboxTheme } from '../../src/theme-creator/generate-sandbox-theme.js'

/**
 * The three changes that answer a live report — "I attach a screenshot of a
 * design and what comes back is nowhere near it":
 *
 * 1. the writer is given the structure of a Cogenta theme as its own system
 *    prompt section, instead of leaving it buried in a tool description;
 * 2. it is told to study and plan before writing, instead of being opened
 *    with "write the theme files now";
 * 3. it can render what it wrote and read the result, instead of running
 *    open-loop and hoping.
 */

const USAGE = { inputTokens: 10, outputTokens: 5 }

function writeCall(input: Readonly<Record<string, unknown>>, id: string): ChatResponse {
  return {
    content: null,
    toolCalls: [{ id, name: 'theme.write_sandbox_file', input }],
    stopReason: 'tool_use',
    usage: USAGE,
  }
}

function previewCall(sandboxId: string, id: string): ChatResponse {
  return {
    content: null,
    toolCalls: [{ id, name: 'theme.preview_sandbox', input: { sandboxId } }],
    stopReason: 'tool_use',
    usage: USAGE,
  }
}

function textResponse(text: string): ChatResponse {
  return { content: text, toolCalls: [], stopReason: 'end_turn', usage: USAGE }
}

function fakeClient(
  responses: readonly ChatResponse[],
): ProviderClient & { readonly requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  let index = 0
  return {
    name: 'fake',
    model: 'fake-model',
    maxOutputTokens: 8000,
    requestTimeoutMs: 180_000,
    maxCorrectionAttempts: 3,
    requests,
    async chat(request) {
      requests.push(request)
      const response = responses[index]
      index += 1
      if (response === undefined) throw new Error('fakeClient: ran out of scripted responses')
      return response
    },
  }
}

const BASE = {
  model: 'fake-model',
  description: 'Reproduce the attached design',
  siteName: 'Acme',
  writeFile: async (input: { readonly path: string }) => ({ path: input.path }),
  deleteFile: async () => undefined,
}

describe('the system prompt a theme writer actually receives', () => {
  it('carries the theme specification as its own section, ahead of the brief', async () => {
    const client = fakeClient([textResponse('nothing written')])
    await generateSandboxTheme({ ...BASE, client, sandboxId: 'spec-1' })

    const system = client.requests[0]?.system ?? ''
    expect(system).toContain('subject="Cogenta theme"')
    expect(system).toContain('theme.render')
    expect(system.indexOf('<specification')).toBeLessThan(system.indexOf('<task>'))
  })

  it('keeps the markup examples in that specification readable rather than entity-escaped', async () => {
    const client = fakeClient([textResponse('nothing written')])
    await generateSandboxTheme({ ...BASE, client, sandboxId: 'spec-2' })

    const system = client.requests[0]?.system ?? ''
    expect(system).not.toContain('&lt;header')
    expect(system).not.toContain('&lt;style')
  })

  it('tells the writer to own its palette, and still refuses gradients', async () => {
    const client = fakeClient([textResponse('nothing written')])
    await generateSandboxTheme({ ...BASE, client, sandboxId: 'spec-3' })

    const system = client.requests[0]?.system ?? ''
    expect(system).toContain('Own your palette')
    expect(system).toContain('Literal colours are allowed')
    expect(system).toContain('Gradients are not')
  })

  it('asks for the design to be described and planned before any file is written', async () => {
    const client = fakeClient([textResponse('nothing written')])
    await generateSandboxTheme({ ...BASE, client, sandboxId: 'spec-4' })

    const system = client.requests[0]?.system ?? ''
    const opening = client.requests[0]?.messages.at(-1)?.content
    const openingText = typeof opening === 'string' ? opening : JSON.stringify(opening ?? '')

    expect(system).toContain('FIRST, before writing any file')
    expect(system).toContain('SECOND, plan the theme')
    expect(openingText).toContain('Begin with step one')
  })
})

describe('a theme writer that can see its own output', () => {
  it('is offered a preview tool only when the caller can really render a sandbox', async () => {
    const blind = fakeClient([textResponse('done')])
    await generateSandboxTheme({ ...BASE, client: blind, sandboxId: 'p-0' })
    expect((blind.requests[0]?.tools ?? []).map((tool) => tool.name)).toEqual([
      'theme.write_sandbox_file',
    ])

    const sighted = fakeClient([textResponse('done')])
    await generateSandboxTheme({
      ...BASE,
      client: sighted,
      sandboxId: 'p-1',
      renderPreview: async () => ({ ok: true, html: '<html></html>' }),
    })
    expect((sighted.requests[0]?.tools ?? []).map((tool) => tool.name)).toContain(
      'theme.preview_sandbox',
    )
  })

  it('hands the rendered markup back so the model can judge what it built', async () => {
    const client = fakeClient([
      writeCall(
        { sandboxId: 'p-2', path: 'theme.render.mjs', content: 'export function renderPage(){}' },
        'call-1',
      ),
      previewCall('p-2', 'call-2'),
      textResponse('Previewed, and the hero is there.'),
    ])

    const result = await generateSandboxTheme({
      ...BASE,
      client,
      sandboxId: 'p-2',
      renderPreview: async () => ({
        ok: true,
        html: '<html><head><style>.cg-hero{color:#fff}</style></head><body><section class="cg-hero">Hi</section></body></html>',
      }),
    })

    expect(result.ok).toBe(true)
    const previewResult = (client.requests.at(-1)?.messages ?? []).find(
      (message) => message.role === 'tool' && message.toolName === 'theme.preview_sandbox',
    )
    const body = typeof previewResult?.content === 'string' ? previewResult.content : ''
    expect(body).toContain('cg-hero')
    expect(body).toContain('"hasStylesheet":true')
  })

  it('says outright when the rendered page carries no stylesheet at all', async () => {
    const client = fakeClient([
      previewCall('p-3', 'call-1'),
      writeCall({ sandboxId: 'p-3', path: 'style.css', content: '.x{color:#000}' }, 'call-2'),
      textResponse('Added the missing stylesheet.'),
    ])

    await generateSandboxTheme({
      ...BASE,
      client,
      sandboxId: 'p-3',
      renderPreview: async () => ({ ok: true, html: '<html><body><main>Hi</main></body></html>' }),
    })

    const previewResult = (client.requests[1]?.messages ?? []).find(
      (message) => message.role === 'tool' && message.toolName === 'theme.preview_sandbox',
    )
    const body = typeof previewResult?.content === 'string' ? previewResult.content : ''
    expect(body).toContain('"hasStylesheet":false')
  })

  it('reports a render failure verbatim, so the model can fix the file it names', async () => {
    const client = fakeClient([
      writeCall({ sandboxId: 'p-4', path: 'theme.render.mjs', content: 'x' }, 'call-1'),
      previewCall('p-4', 'call-2'),
      textResponse('stopping'),
    ])

    await generateSandboxTheme({
      ...BASE,
      client,
      sandboxId: 'p-4',
      renderPreview: async () => ({
        ok: false,
        error: 'theme.render.mjs: renderPage returned undefined',
      }),
    })

    const previewResult = (client.requests.at(-1)?.messages ?? []).find(
      (message) => message.role === 'tool' && message.toolName === 'theme.preview_sandbox',
    )
    const body = typeof previewResult?.content === 'string' ? previewResult.content : ''
    expect(body).toContain('renderPage returned undefined')
  })

  it('never mistakes a repeated preview for an agent going nowhere', async () => {
    // Three byte-identical preview calls is the correction loop's normal
    // shape — and exactly what the runtime's default repetition ceiling of
    // two would have cut off, at the moment the theme was being fixed.
    const client = fakeClient([
      previewCall('p-5', 'call-1'),
      writeCall({ sandboxId: 'p-5', path: 'a.css', content: '.a{color:#111}' }, 'call-2'),
      previewCall('p-5', 'call-3'),
      writeCall({ sandboxId: 'p-5', path: 'b.css', content: '.b{color:#222}' }, 'call-4'),
      previewCall('p-5', 'call-5'),
      textResponse('Now it matches the reference.'),
    ])

    const result = await generateSandboxTheme({
      ...BASE,
      client,
      sandboxId: 'p-5',
      renderPreview: async () => ({ ok: true, html: '<html><body>ok</body></html>' }),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rationale).toContain('matches the reference')
    expect(result.filesWritten).toEqual(['a.css', 'b.css'])
  })

  it('truncates a very large render rather than letting one preview fill the context', async () => {
    const client = fakeClient([previewCall('p-6', 'call-1'), textResponse('read it')])

    await generateSandboxTheme({
      ...BASE,
      client,
      sandboxId: 'p-6',
      renderPreview: async () => ({ ok: true, html: `<html>${'x'.repeat(40_000)}</html>` }),
    })

    const previewResult = (client.requests.at(-1)?.messages ?? []).find(
      (message) => message.role === 'tool' && message.toolName === 'theme.preview_sandbox',
    )
    const body = typeof previewResult?.content === 'string' ? previewResult.content : ''
    expect(body).toContain('truncated')
    expect(body.length).toBeLessThan(40_000)
  })
})

/**
 * A theme is a container for the site's content. A writer that does not know
 * the container's shape guesses at it — and a guessed collection name renders
 * nothing, which invites the far worse fix of hardcoding articles into the
 * markup, where nobody can edit or translate them.
 */
describe('a theme writer that knows what the site actually stores', () => {
  it('is told the real collections, their fields, and which ones have a public page', async () => {
    const client = fakeClient([textResponse('noted')])
    await generateSandboxTheme({
      ...BASE,
      client,
      sandboxId: 'cm-1',
      contentModel: [
        '- article: title (text), excerpt (text), coverImage (media). has a public page — link to entries with ctx.link({collection, id}).',
        '- setting: siteTagline (text). no public page — render it inline, never link to it.',
      ].join('\n'),
    })

    const system = client.requests[0]?.system ?? ''
    expect(system).toContain('article: title (text)')
    expect(system).toContain('coverImage (media)')
    expect(system).toContain('never invent entries')
    // The distinction matters: linking to an unrouted collection is a dead link.
    expect(system).toContain('no public page')
  })

  it('says nothing about content when the caller has no schema to describe', async () => {
    const client = fakeClient([textResponse('noted')])
    await generateSandboxTheme({ ...BASE, client, sandboxId: 'cm-2' })

    expect(client.requests[0]?.system ?? '').not.toContain('never invent entries')
  })
})
