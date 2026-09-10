import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ChatRequest, ChatResponse, ProviderClient } from '@cogenta/agents'
import { generateSandboxTheme } from '@cogenta/agents-builtin'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSandbox,
  deleteSandboxFile,
  listSandboxFiles,
  readSandboxFile,
  renderSandboxPreview,
  writeSandboxFile,
} from '../src/commands/theme-sandbox.js'

/**
 * The generation loop against real infrastructure: a real sandbox directory
 * on disk, real `writeSandboxFile` validation (a bad manifest is genuinely
 * rejected, by the same code the HTTP route calls), and real
 * `renderSandboxPreview` — an actual isolated module import that actually
 * renders. Only the model is scripted, because only the model needs an API
 * key this suite does not have.
 *
 * What it is really pinning down is the property a live report exposed: a
 * theme writer that cannot see its own output cannot converge on a design.
 * Every assertion below is about that loop being closed for real — the
 * markup the agent is shown is the markup the sandbox actually produced, and
 * a broken theme comes back as the real error rather than as silence.
 *
 * Fixtures live under `packages/cli/test/tmp/` for the same reason
 * `theme-sandbox.test.ts` explains at length: the render module does a real
 * `import('@cogenta/theme-kit')`, which only resolves from inside this
 * package's own tree.
 */

const TMP_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'tmp')
const USAGE = { inputTokens: 10, outputTokens: 5 }

const GOOD_RENDER_MODULE = `
import { h } from '@cogenta/theme-kit'
export function renderPage(page) {
  return h('main', { class: 'wd-main' }, [
    h('section', { class: 'wd-hero' }, h('h1', { class: 'wd-hero__title' }, page.title)),
  ])
}
export function renderChrome(input) {
  return {
    header: '<header class="wd-header">' + input.site.name + '</header>',
    footer: '<footer class="wd-footer">end</footer>',
  }
}
`

const BROKEN_RENDER_MODULE = `
export function renderPage() {
  throw new Error('the hero section blew up')
}
export function renderChrome() {
  return { header: '', footer: '' }
}
`

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

function scriptedClient(
  responses: readonly ChatResponse[],
): ProviderClient & { readonly requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  let index = 0
  return {
    name: 'scripted',
    model: 'scripted-model',
    maxOutputTokens: 8000,
    requestTimeoutMs: 180_000,
    maxCorrectionAttempts: 3,
    requests,
    async chat(request) {
      requests.push(request)
      const response = responses[index]
      index += 1
      if (response === undefined) throw new Error('scriptedClient: ran out of scripted responses')
      return response
    },
  }
}

function toolResultsIn(request: ChatRequest | undefined, toolName: string): string[] {
  return (request?.messages ?? [])
    .filter((message) => message.role === 'tool' && message.toolName === toolName)
    .map((message) => (typeof message.content === 'string' ? message.content : ''))
}

describe('the theme generation loop, against a real sandbox', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
    roots.length = 0
  })

  async function projectRoot(): Promise<string> {
    await mkdir(TMP_ROOT, { recursive: true })
    const root = await mkdtemp(join(TMP_ROOT, 'gen-loop-'))
    roots.push(root)
    return root
  }

  function wiring(root: string) {
    return {
      writeFile: (input: { sandboxId: string; path: string; content: string }) =>
        writeSandboxFile(root, input.sandboxId, input.path, input.content),
      deleteFile: (input: { sandboxId: string; path: string }) =>
        deleteSandboxFile(root, input.sandboxId, input.path),
      renderPreview: (input: { sandboxId: string }) =>
        renderSandboxPreview({ projectRoot: root, id: input.sandboxId, siteName: 'Acme' }),
      listFiles: (input: { sandboxId: string }) => listSandboxFiles(root, input.sandboxId),
      readFile: (input: { sandboxId: string; path: string }) =>
        readSandboxFile(root, input.sandboxId, input.path),
    }
  }

  it('shows the agent the markup its own theme really rendered', async () => {
    const root = await projectRoot()
    await createSandbox(root, 'loop-1')

    const client = scriptedClient([
      writeCall(
        { sandboxId: 'loop-1', path: 'theme.render.mjs', content: GOOD_RENDER_MODULE },
        'call-1',
      ),
      writeCall(
        {
          sandboxId: 'loop-1',
          path: 'style.css',
          content: '.wd-hero{background:#0e1013;color:#f2f4f7}',
        },
        'call-2',
      ),
      previewCall('loop-1', 'call-3'),
      textResponse('Hero renders, stylesheet is attached.'),
    ])

    const result = await generateSandboxTheme({
      client,
      model: 'scripted-model',
      description: 'A dark hero-led layout',
      siteName: 'Acme',
      sandboxId: 'loop-1',
      ...wiring(root),
    })

    expect(result.ok).toBe(true)
    const previews = toolResultsIn(client.requests.at(-1), 'theme.preview_sandbox')
    expect(previews).toHaveLength(1)
    // The class names below exist only because the render module the agent
    // wrote emitted them — this is the real render, not a fixture.
    expect(previews[0]).toContain('wd-hero__title')
    expect(previews[0]).toContain('wd-header')
    expect(previews[0]).toContain('"hasStylesheet":true')
  })

  it('lets the agent discover a theme that renders unstyled, and fix it', async () => {
    const root = await projectRoot()
    await createSandbox(root, 'loop-2')

    const client = scriptedClient([
      writeCall(
        { sandboxId: 'loop-2', path: 'theme.render.mjs', content: GOOD_RENDER_MODULE },
        'call-1',
      ),
      previewCall('loop-2', 'call-2'),
      writeCall(
        { sandboxId: 'loop-2', path: 'style.css', content: '.wd-hero{background:#0e1013}' },
        'call-3',
      ),
      previewCall('loop-2', 'call-4'),
      textResponse('The stylesheet was missing; it is there now.'),
    ])

    const result = await generateSandboxTheme({
      client,
      model: 'scripted-model',
      description: 'A dark hero-led layout',
      siteName: 'Acme',
      sandboxId: 'loop-2',
      ...wiring(root),
    })

    expect(result.ok).toBe(true)
    const previews = toolResultsIn(client.requests.at(-1), 'theme.preview_sandbox')
    expect(previews).toHaveLength(2)
    expect(previews[0]).toContain('"hasStylesheet":false')
    expect(previews[1]).toContain('"hasStylesheet":true')
  })

  it('names what actually threw, and previews only what really landed on disk', async () => {
    const root = await projectRoot()
    await createSandbox(root, 'loop-3')

    const client = scriptedClient([
      writeCall(
        { sandboxId: 'loop-3', path: 'theme.render.mjs', content: BROKEN_RENDER_MODULE },
        'call-1',
      ),
      previewCall('loop-3', 'call-2'),
      writeCall(
        { sandboxId: 'loop-3', path: 'theme.render.mjs', content: GOOD_RENDER_MODULE },
        'call-3',
      ),
      previewCall('loop-3', 'call-4'),
      textResponse('Fixed the section that threw.'),
    ])

    const result = await generateSandboxTheme({
      client,
      model: 'scripted-model',
      description: 'A dark hero-led layout',
      siteName: 'Acme',
      sandboxId: 'loop-3',
      ...wiring(root),
    })

    expect(result.ok).toBe(true)

    // A render module whose renderPage throws never reaches the sandbox at
    // all: `writeSandboxFile` renders it as part of validating the write and
    // rolls the file back, so the agent learns what threw from the *write*
    // result — earlier, and more precisely, than a preview could have told
    // it.
    const writes = toolResultsIn(client.requests.at(-1), 'theme.write_sandbox_file')
    expect(writes[0]).toContain('the hero section blew up')

    // Which is why the preview that follows reports an empty sandbox rather
    // than a broken render: the rollback really removed the file.
    const previews = toolResultsIn(client.requests.at(-1), 'theme.preview_sandbox')
    expect(previews[0]).toContain('nothing to preview')
    expect(previews[1]).toContain('wd-hero__title')
  })

  it('still rejects a bad manifest through the same validation the HTTP route uses', async () => {
    const root = await projectRoot()
    await createSandbox(root, 'loop-4')

    const client = scriptedClient([
      writeCall(
        { sandboxId: 'loop-4', path: 'theme.config.mjs', content: 'export const nope = 1' },
        'call-1',
      ),
      writeCall(
        { sandboxId: 'loop-4', path: 'theme.render.mjs', content: GOOD_RENDER_MODULE },
        'call-2',
      ),
      textResponse('Recovered after the manifest was refused.'),
    ])

    const result = await generateSandboxTheme({
      client,
      model: 'scripted-model',
      description: 'x',
      siteName: 'Acme',
      sandboxId: 'loop-4',
      ...wiring(root),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The refused manifest is not in the receipt; the render module is.
    expect(result.filesWritten).toEqual(['theme.render.mjs'])
    const writes = toolResultsIn(client.requests.at(-1), 'theme.write_sandbox_file')
    expect(writes.some((text) => text.includes('default export'))).toBe(true)
  })
})
