import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClassifyPanel } from '../../src/assist/classify-panel.js'

/**
 * `assist.classify` given a screen: suggestions must never apply themselves.
 */

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify({ data: body }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const CAPABILITIES = {
  available: true,
  tools: [
    {
      tool: 'assist.classify',
      label: 'Suggest categories',
      description: 'Suggest categories.',
      cost: 'low',
      needs: ['taxonomy'],
    },
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function panel(overrides: Partial<Parameters<typeof ClassifyPanel>[0]> = {}) {
  const onAccept = vi.fn()
  return {
    onAccept,
    element: (
      <ClassifyPanel
        token="t"
        text="A long article about hiking trails in the Alps."
        field={{ name: 'tags', label: 'Tags', options: ['travel', 'food', 'sport'] }}
        currentValue={[]}
        onAccept={onAccept}
        {...overrides}
      />
    ),
  }
}

describe('the classify panel on a site with no AI provider', () => {
  it('renders nothing at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ available: false, tools: [] })),
    )
    const { element } = panel()
    const { container } = render(element)

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })
})

describe('the classify panel on a configured site', () => {
  it('never applies a suggestion on its own — accepting one is a real, separate click', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? jsonResponse({
            labels: [{ label: 'travel', confidence: 0.8 }],
            rejected: [],
            applied: false,
          })
        : jsonResponse(CAPABILITIES),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { element, onAccept } = panel()
    render(element)

    fireEvent.click(await screen.findByRole('button', { name: 'Suggérer des catégories' }))
    await screen.findByText(/travel/u)

    // The suggestion is on screen but nothing has been applied yet.
    expect(onAccept).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Utiliser' }))
    expect(onAccept).toHaveBeenCalledWith('tags', ['travel'])
  })

  it('reports a label outside the site vocabulary as rejected, never as a button', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? jsonResponse({
            labels: [],
            rejected: ['made-up-category'],
            applied: false,
          })
        : jsonResponse(CAPABILITIES),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(panel().element)
    fireEvent.click(await screen.findByRole('button', { name: 'Suggérer des catégories' }))

    expect(await screen.findByText(/made-up-category/u)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'made-up-category' })).toBeNull()
  })
})
