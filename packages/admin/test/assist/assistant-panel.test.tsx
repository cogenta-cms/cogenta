import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssistantPanel } from '../../src/assist/assistant-panel.js'

/**
 * The lot's hardest interface rule, checked first: with no AI provider, this
 * component renders nothing at all — not a disabled button, not an upsell, not
 * an error.
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
      tool: 'assist.rewrite',
      label: 'Rewrite',
      description: 'Rewrite a passage.',
      cost: 'medium',
      needs: [],
    },
    {
      tool: 'assist.translate',
      label: 'Translate',
      description: 'Translate a passage.',
      cost: 'medium',
      needs: ['targetLocale'],
    },
  ],
}

const OFF = {
  available: false,
  reason: 'No AI provider is configured for this site, so the writing assistant is switched off.',
  tools: [],
}

function runInitOf(call: unknown[] | undefined): RequestInit {
  if (call === undefined) throw new Error('no matching fetch call')
  return call[1] as RequestInit
}

function panel(overrides: Partial<Parameters<typeof AssistantPanel>[0]> = {}) {
  return (
    <AssistantPanel
      token="t"
      fields={[{ name: 'body', label: 'Body', value: 'The museum opened in 1904.' }]}
      locale="en"
      siteLocales={['en', 'fr']}
      onApply={vi.fn()}
      {...overrides}
    />
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the assistant panel on a site with no AI provider', () => {
  it('renders nothing whatsoever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(OFF)),
    )

    const { container } = render(panel())

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
    expect(screen.queryByText(/assistant/iu)).toBeNull()
  })

  it('renders nothing when the only tool on offer is one it cannot drive', async () => {
    // This is what a real no-AI site answers: duplicate detection is available
    // (it needs no model at all), but it wants a site id and a collection scope
    // this panel has no way to supply. Showing a button that would fail when
    // pressed is worse than showing nothing.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          available: true,
          tools: [
            {
              tool: 'assist.find_duplicates',
              label: 'Find duplicates',
              description: 'Find near-identical entries.',
              cost: 'low',
              needs: ['siteId', 'collections'],
            },
          ],
        }),
      ),
    )

    const { container } = render(panel())

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })

  it('renders nothing when the route itself cannot be reached either', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    )

    const { container } = render(panel())

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })
})

describe('the assistant panel on a configured site', () => {
  it('offers one button per tool the server listed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(CAPABILITIES)),
    )

    render(panel())

    expect(await screen.findByRole('button', { name: 'Rewrite' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Translate' })).toBeDefined()
  })

  it('disables every tool while the entry has no text to work on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(CAPABILITIES)),
    )

    render(panel({ fields: [{ name: 'body', label: 'Body', value: '   ' }] }))

    const button = await screen.findByRole('button', { name: 'Rewrite' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('lets the editor pick which field the assistant works on', async () => {
    const onApply = vi.fn()
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? jsonResponse({ suggestions: ['A better summary.'], applied: false })
        : jsonResponse(CAPABILITIES),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      panel({
        onApply,
        fields: [
          { name: 'body', label: 'Body', value: 'The museum opened in 1904.' },
          { name: 'summary', label: 'Summary', value: 'A museum.' },
        ],
      }),
    )

    fireEvent.change(await screen.findByLabelText('Quel champ ?'), {
      target: { value: 'summary' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser' }))

    const runCall = (fetchMock.mock.calls as unknown[][]).find((call) =>
      String(call[0]).endsWith('/run'),
    )
    const body = JSON.parse(String(runInitOf(runCall).body)) as {
      input: Record<string, unknown>
    }
    expect(body.input['text']).toBe('A museum.')
    expect(onApply).toHaveBeenCalledWith('summary', 'A better summary.', 'assist.rewrite')
  })

  it('shows the suggestion and says, in so many words, that nothing was changed', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? jsonResponse({ suggestions: ['A shorter sentence.'], applied: false })
        : jsonResponse(CAPABILITIES),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(panel())
    fireEvent.click(await screen.findByRole('button', { name: 'Rewrite' }))

    expect(await screen.findByText('A shorter sentence.')).toBeDefined()
    expect(screen.getByText(/Rien n'a été modifié/u)).toBeDefined()
  })

  it('hands an accepted suggestion to the form and never writes it itself', async () => {
    const onApply = vi.fn()
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? jsonResponse({ suggestions: ['A shorter sentence.'], applied: false })
        : jsonResponse(CAPABILITIES),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(panel({ onApply }))
    fireEvent.click(await screen.findByRole('button', { name: 'Rewrite' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser' }))

    expect(onApply).toHaveBeenCalledWith('body', 'A shorter sentence.', 'assist.rewrite')
    // Two calls: the capability probe and the suggestion. No content write.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('/api/content')
    }
  })

  it('sends the target language for a tool that needs one', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? jsonResponse({ suggestions: ['Une phrase.'], applied: false })
        : jsonResponse(CAPABILITIES),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(panel())
    fireEvent.click(await screen.findByRole('button', { name: 'Translate' }))

    await screen.findByText('Une phrase.')
    const runCall = (fetchMock.mock.calls as unknown[][]).find((call) =>
      String(call[0]).endsWith('/run'),
    )
    const body = JSON.parse(String(runInitOf(runCall).body)) as {
      tool: string
      input: Record<string, unknown>
    }
    expect(body.tool).toBe('assist.translate')
    expect(body.input['targetLocale']).toBe('fr')
  })

  it('reports a failed suggestion in the panel instead of losing it silently', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? new Response(
            JSON.stringify({
              error: { code: 'PROVIDER_RATE_LIMITED', message: 'The provider is rate-limiting.' },
            }),
            { status: 429, headers: { 'content-type': 'application/json' } },
          )
        : jsonResponse(CAPABILITIES),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(panel())
    fireEvent.click(await screen.findByRole('button', { name: 'Rewrite' }))

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.getByText('The provider is rate-limiting.')).toBeDefined()
  })

  it('carries the editor session token, so the route can refuse an anonymous caller', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(CAPABILITIES))
    vi.stubGlobal('fetch', fetchMock)

    render(panel())
    await screen.findByRole('button', { name: 'Rewrite' })

    const headers = (runInitOf(fetchMock.mock.calls[0] as unknown[]).headers ?? {}) as Record<
      string,
      string
    >
    expect(headers['authorization']).toBe('Bearer t')
  })
})
