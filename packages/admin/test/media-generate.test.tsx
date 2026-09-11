import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../src/i18n/index.js'
import { GeneratePanel } from '../src/media/generate-panel.js'
import { expectNoSeriousA11yViolations } from './helpers/axe.js'

/**
 * The media library's "Générer une image" panel.
 *
 * Two behaviours carry the feature, and neither is visible from the markup
 * alone: the panel must be *entirely* absent on a site with no image model
 * (R2 — an empty card would be worse than nothing), and keeping an image is
 * a second, separate call the operator makes, never a side effect of
 * generating. The test asserting that `POST /api/media/generate/keep` is not
 * called until a human clicks is the one that protects the whole design.
 */

const TOKEN = 'test-token'

/** A real 1×1 PNG — small, but genuinely decodable bytes. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

interface Call {
  readonly url: string
  readonly method: string
  readonly body: Record<string, unknown> | null
}

function installFetch(options: { readonly available: boolean }): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({
        url: input,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      })

      const json = (data: unknown, status = 200): Response =>
        new Response(JSON.stringify({ data }), {
          status,
          headers: { 'content-type': 'application/json' },
        })

      if (input === '/api/media/generate' && method === 'GET') {
        return json(
          options.available ? { available: true, model: 'gpt-image-1' } : { available: false },
        )
      }
      if (input === '/api/media/generate' && method === 'POST') {
        return json({
          provider: 'openai',
          model: 'gpt-image-1',
          applied: false,
          images: [
            { dataUrl: PNG, contentType: 'image/png', revisedPrompt: 'a rewritten prompt' },
            { dataUrl: `${PNG}AA`, contentType: 'image/png' },
          ],
        })
      }
      if (input === '/api/media/generate/keep') {
        return json({ id: 'asset-1', filename: 'hero.png', byteLength: 68 }, 201)
      }
      throw new Error(`unexpected request: ${method} ${input}`)
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('generating an image from the media library', () => {
  it('renders nothing at all when no image model is configured', async () => {
    installFetch({ available: false })

    const { container } = render(<GeneratePanel token={TOKEN} onKept={() => undefined} />)

    await waitFor(() => expect(container.textContent).toBe(''))
    // Not a disabled form, not an empty card: absent.
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('shows candidates without storing anything, and keeps only the chosen one', async () => {
    const calls = installFetch({ available: true })
    const kept = vi.fn()

    const { container } = render(<GeneratePanel token={TOKEN} onKept={kept} />)
    await screen.findByRole('heading', { name: 'Générer une image' })

    fireEvent.change(screen.getByLabelText("Décrire l'image"), {
      target: { value: 'un boulanger enfournant des baguettes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    await screen.findByText(/Rien n'est encore enregistré/)
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    // The vendor rewrote the prompt, and the editor can see that it did.
    expect(screen.getByText(/a rewritten prompt/)).toBeDefined()

    // Generating stored nothing: no keep call has been made.
    expect(calls.some((call) => call.url === '/api/media/generate/keep')).toBe(false)
    expect(kept).not.toHaveBeenCalled()

    // Keeping is blocked until the image has a description.
    const keepButton = screen.getByRole('button', { name: 'Conserver cette image' })
    expect(keepButton).toHaveProperty('disabled', true)

    fireEvent.click(screen.getAllByRole('radio')[1] as HTMLElement)
    fireEvent.change(screen.getByLabelText('Texte alternatif'), {
      target: { value: 'Un boulanger enfourne un plateau de baguettes' },
    })
    await expectNoSeriousA11yViolations(container)

    fireEvent.click(screen.getByRole('button', { name: 'Conserver cette image' }))

    await waitFor(() => expect(kept).toHaveBeenCalledTimes(1))
    const keepCall = calls.find((call) => call.url === '/api/media/generate/keep')
    expect(keepCall?.body?.['alt']).toBe('Un boulanger enfourne un plateau de baguettes')
    // The second candidate, the one actually selected — not the first.
    expect(keepCall?.body?.['dataUrl']).toBe(`${PNG}AA`)

    // And the candidates are cleared, so the same picture cannot be kept twice.
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(await screen.findByText(/ajoutée à la médiathèque/)).toBeDefined()
  })
})
