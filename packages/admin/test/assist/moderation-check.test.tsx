import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModerationCheck } from '../../src/assist/moderation-check.js'

/**
 * `assist.moderate` given a screen: a signal a human reads, never an action —
 * the tool's own output can only ever say `none`/`review`
 * (`packages/agents/src/assist/classify.ts`'s closed `RECOMMENDED_ACTIONS`),
 * and nothing this component renders offers to remove or hide anything.
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
      tool: 'assist.moderate',
      label: 'Check for review',
      description: 'Flag content for review.',
      cost: 'low',
      needs: [],
    },
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the moderation check on a site with no AI provider', () => {
  it('renders nothing at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ available: false, tools: [] })),
    )
    const { container } = render(<ModerationCheck token="t" text="Some comment." />)

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })
})

describe('the moderation check on a configured site', () => {
  it('shows a flagged verdict as a badge to read, with no delete or hide action anywhere', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? jsonResponse({
            flagged: true,
            severity: 'medium',
            categories: ['spam'],
            reason: 'Looks like an unsolicited advert.',
            recommendedAction: 'review',
            applied: false,
          })
        : jsonResponse(CAPABILITIES),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<ModerationCheck token="t" text="Buy my product now!!!" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier' }))

    expect(await screen.findByText(/Looks like an unsolicited advert\./u)).toBeDefined()
    expect(screen.getByText(/spam/u)).toBeDefined()
    // The closed action vocabulary in practice: no button on this screen can
    // ever say "delete" or "unpublish".
    expect(screen.queryByRole('button', { name: /delete|remove|unpublish|supprimer/iu })).toBeNull()
  })

  it('reports a clean result without a badge', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? jsonResponse({
            flagged: false,
            severity: 'none',
            categories: [],
            reason: '',
            recommendedAction: 'none',
            applied: false,
          })
        : jsonResponse(CAPABILITIES),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<ModerationCheck token="t" text="A perfectly normal comment." />)
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier' }))

    expect(await screen.findByText('Rien qui nécessite un regard humain.')).toBeDefined()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
