import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
 * The second turn: the operator has seen the theme and asks for a change.
 *
 * This is the shape the feature is actually used in — generate, look, "make
 * it darker", look again — and it was impossible before, for one concrete
 * reason: the agent had no way to read what it was being asked to change. A
 * write replaces a whole file, so an agent editing from assumption silently
 * discards every decision the operator just approved.
 *
 * Real sandbox on disk, real validation, real render. Only the model is
 * scripted.
 */

const TMP_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'tmp')
const USAGE = { inputTokens: 10, outputTokens: 5 }

const RENDER_MODULE = `
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

const ORIGINAL_CSS = `:root { --t-bg: #f7f5f0; --t-fg: #1b1b1b; --t-accent: #b4552d; }
.wd-main { background: var(--t-bg); color: var(--t-fg); }
.wd-hero { padding: 4rem 2rem; }
.wd-hero__title { font-family: Fraunces, Georgia, serif; font-size: 3rem; }
`

function toolCall(
  name: string,
  input: Readonly<Record<string, unknown>>,
  id: string,
): ChatResponse {
  return { content: null, toolCalls: [{ id, name, input }], stopReason: 'tool_use', usage: USAGE }
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

describe('adjusting a theme that already exists', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
    roots.length = 0
  })

  async function sandboxWithTheme(id: string): Promise<string> {
    await mkdir(TMP_ROOT, { recursive: true })
    const root = await mkdtemp(join(TMP_ROOT, 'refine-'))
    roots.push(root)
    const dir = await createSandbox(root, id)
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await writeFile(join(dir, 'style.css'), ORIGINAL_CSS, 'utf8')
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

  it('reads the existing theme before changing it, and keeps what was not asked about', async () => {
    const root = await sandboxWithTheme('refine-1')

    const client = scriptedClient([
      toolCall('theme.list_sandbox_files', { sandboxId: 'refine-1' }, 'c1'),
      toolCall('theme.read_sandbox_file', { sandboxId: 'refine-1', path: 'style.css' }, 'c2'),
      toolCall(
        'theme.write_sandbox_file',
        {
          sandboxId: 'refine-1',
          path: 'style.css',
          // The same file, dark, with the serif heading deliberately kept.
          content: ORIGINAL_CSS.replace('#f7f5f0', '#0e1013').replace('#1b1b1b', '#f2f4f7'),
        },
        'c3',
      ),
      toolCall('theme.preview_sandbox', { sandboxId: 'refine-1' }, 'c4'),
      textResponse(
        'Darkened the background and text; the serif heading and spacing are unchanged.',
      ),
    ])

    const result = await generateSandboxTheme({
      client,
      model: 'scripted-model',
      description: 'Rends-le plus sombre',
      siteName: 'Acme',
      sandboxId: 'refine-1',
      refine: { originalBrief: 'A warm editorial blog theme' },
      ...wiring(root),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // It really listed and really read — not guessed at a filename.
    const listed = toolResultsIn(client.requests.at(-1), 'theme.list_sandbox_files')
    expect(listed[0]).toContain('style.css')
    const read = toolResultsIn(client.requests.at(-1), 'theme.read_sandbox_file')
    expect(read[0]).toContain('Fraunces')

    // And the file on disk is the changed one, with the untouched parts intact.
    const after = await readSandboxFile(root, 'refine-1', 'style.css')
    expect(after).toContain('#0e1013')
    expect(after).toContain('Fraunces')
    expect(after).not.toContain('#f7f5f0')
  })

  it('does not re-open the design analysis when it is only being asked for a change', async () => {
    const root = await sandboxWithTheme('refine-2')

    const client = scriptedClient([textResponse('Nothing to do.')])

    await generateSandboxTheme({
      client,
      model: 'scripted-model',
      description: 'Passe la grille en deux colonnes',
      siteName: 'Acme',
      sandboxId: 'refine-2',
      refine: { originalBrief: 'A warm editorial blog theme' },
      ...wiring(root),
    })

    const system = client.requests[0]?.system ?? ''
    const opening = client.requests[0]?.messages.at(-1)?.content
    const openingText = typeof opening === 'string' ? opening : JSON.stringify(opening ?? '')

    expect(system).toContain('already exists in sandbox "refine-2"')
    expect(system).toContain('A warm editorial blog theme')
    expect(system).toContain('Passe la grille en deux colonnes')
    // The create-from-scratch opening must not fire on a refinement.
    expect(openingText).toContain('Read the sandbox first')
    expect(openingText).not.toContain('Begin with step one')
  })

  it('replays what was already said, so a follow-up like "a bit less" has a referent', async () => {
    const root = await sandboxWithTheme('refine-3')
    const client = scriptedClient([textResponse('Eased it back.')])

    await generateSandboxTheme({
      client,
      model: 'scripted-model',
      description: 'Un peu moins',
      siteName: 'Acme',
      sandboxId: 'refine-3',
      refine: {
        originalBrief: 'A warm editorial blog theme',
        priorTurns: [
          { role: 'user', text: 'Rends-le plus sombre' },
          { role: 'assistant', text: 'Darkened the background to near-black.' },
        ],
      },
      ...wiring(root),
    })

    const messages = client.requests[0]?.messages ?? []
    const texts = messages.map((message) =>
      typeof message.content === 'string' ? message.content : '',
    )
    expect(texts.some((text) => text.includes('Rends-le plus sombre'))).toBe(true)
    expect(texts.some((text) => text.includes('near-black'))).toBe(true)
    // Order matters: the earlier turns come before this request.
    const priorIndex = texts.findIndex((text) => text.includes('Rends-le plus sombre'))
    const askIndex = texts.findIndex((text) => text.includes('Read the sandbox first'))
    expect(priorIndex).toBeLessThan(askIndex)
  })

  it('never counts a file it merely read as a file it wrote', async () => {
    const root = await sandboxWithTheme('refine-4')

    const client = scriptedClient([
      toolCall('theme.read_sandbox_file', { sandboxId: 'refine-4', path: 'style.css' }, 'c1'),
      toolCall(
        'theme.write_sandbox_file',
        { sandboxId: 'refine-4', path: 'extra.css', content: '.x{color:#111}' },
        'c2',
      ),
      textResponse('Added one file.'),
    ])

    const result = await generateSandboxTheme({
      client,
      model: 'scripted-model',
      description: 'Ajoute une feuille',
      siteName: 'Acme',
      sandboxId: 'refine-4',
      refine: { originalBrief: 'A warm editorial blog theme' },
      ...wiring(root),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // `style.css` was read, not written — reporting it would be a lie about
    // what the run changed.
    expect(result.filesWritten).toEqual(['extra.css'])
  })
})
