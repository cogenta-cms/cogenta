import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExcerptAssistButton } from '../../src/collections/excerpt-assist-button.js'

/**
 * Fiche 44 task 3 — mounted directly, same isolation `seo-panel.test.tsx`
 * already uses for its own per-field suggest buttons: a self-contained
 * component, its own fetch mock, no shared harness.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const NO_PROVIDER = { available: false, tools: [] }

const SUMMARISE_TOOL = {
  tool: 'assist.summarise',
  label: 'Summarise',
  description: 'Summarise a passage.',
  cost: 'low',
  needs: [],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('R2 — no AI provider configured', () => {
  it('renders nothing at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(NO_PROVIDER)),
    )
    const { container } = render(
      <ExcerptAssistButton token="t" bodyText="Some body text." onChange={vi.fn()} />,
    )

    await waitFor(() => expect(container.innerHTML).toBe(''))
  })

  it('renders nothing when the provider exists but does not offer assist.summarise', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          available: true,
          tools: [
            { tool: 'assist.titles', label: 'Titles', description: '', cost: 'low', needs: [] },
          ],
        }),
      ),
    )
    const { container } = render(
      <ExcerptAssistButton token="t" bodyText="Some body text." onChange={vi.fn()} />,
    )

    await waitFor(() => expect(container.innerHTML).toBe(''))
  })
})

describe('with an AI provider offering assist.summarise', () => {
  it('shows a suggestion, and applies it only on explicit click — never on its own', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url)
      if (href.endsWith('/run')) {
        const body = JSON.parse(String(init?.body)) as { tool: string; input: unknown }
        expect(body.tool).toBe('assist.summarise')
        expect(body.input).toEqual({ text: 'The full body text.', maxWords: 50 })
        return jsonResponse({ suggestions: ['A short excerpt.'], applied: false })
      }
      if (href.includes('/api/assistant')) {
        return jsonResponse({ available: true, tools: [SUMMARISE_TOOL] })
      }
      return jsonResponse(NO_PROVIDER)
    })
    vi.stubGlobal('fetch', fetchMock)

    const onChange = vi.fn()
    render(<ExcerptAssistButton token="t" bodyText="The full body text." onChange={onChange} />)

    const button = await screen.findByRole('button', { name: "Générer l'extrait avec l'IA" })
    fireEvent.click(button)

    const suggestion = await screen.findByText('A short excerpt.')
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(suggestion)
    expect(onChange).toHaveBeenCalledWith('A short excerpt.')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('disables the button while there is no body text to summarise', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ available: true, tools: [SUMMARISE_TOOL] })),
    )
    render(<ExcerptAssistButton token="t" bodyText="" onChange={vi.fn()} />)

    const button = (await screen.findByRole('button', {
      name: "Générer l'extrait avec l'IA",
    })) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('reports an error without crashing when the tool call fails', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.endsWith('/run')) {
        return new Response(JSON.stringify({ error: { code: 'BOOM', message: 'Boom.' } }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (href.includes('/api/assistant')) {
        return jsonResponse({ available: true, tools: [SUMMARISE_TOOL] })
      }
      return jsonResponse(NO_PROVIDER)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ExcerptAssistButton token="t" bodyText="Some text." onChange={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: "Générer l'extrait avec l'IA" }))

    expect(await screen.findByRole('alert')).toBeDefined()
  })
})
