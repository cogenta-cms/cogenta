import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FaqSchemaPanel } from '../../src/assist/faq-schema-panel.js'

/**
 * `assist.faq_draft` and `assist.schema_org_draft` given a screen: both are
 * always drafts (`status: 'draft'` as a literal on the wire), and this panel
 * must keep that — nothing lands in the entry until a real, separate click.
 */

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify({ data: body }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const FAQ_TOOL = {
  tool: 'assist.faq_draft',
  label: 'Draft a FAQ',
  description: 'Draft a FAQ.',
  cost: 'medium',
  needs: [],
}

const SCHEMA_TOOL = {
  tool: 'assist.schema_org_draft',
  label: 'Draft structured data',
  description: 'Draft structured data.',
  cost: 'medium',
  needs: ['type'],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the FAQ/Schema.org panel on a site with no AI provider', () => {
  it('renders nothing at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ available: false, tools: [] })),
    )
    const { container } = render(
      <FaqSchemaPanel
        token="t"
        text="A page about the museum."
        blockZone="body"
        onAcceptFaq={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })
})

describe('the FAQ draft', () => {
  it('only reaches the page once the editor explicitly accepts it', async () => {
    const onAcceptFaq = vi.fn()
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? jsonResponse({
            items: [{ question: 'When did it open?', answer: 'In 1904.' }],
            status: 'draft',
            applied: false,
          })
        : jsonResponse({ available: true, tools: [FAQ_TOOL] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <FaqSchemaPanel
        token="t"
        text="The museum opened in 1904."
        blockZone="body"
        onAcceptFaq={onAcceptFaq}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Rédiger une FAQ' }))
    await screen.findByText('When did it open?')

    // On screen as a draft, but nothing written yet.
    expect(onAcceptFaq).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à la page' }))

    expect(onAcceptFaq).toHaveBeenCalledTimes(1)
    const [zone, block] = onAcceptFaq.mock.calls[0] as [string, { type: string; data: unknown }]
    expect(zone).toBe('body')
    expect(block.type).toBe('faq')
    expect((block.data as { items: readonly { question: string }[] }).items[0]?.question).toBe(
      'When did it open?',
    )
  })

  it('offers no "accept" action on a collection with no page body to add a block to', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? jsonResponse({
            items: [{ question: 'When did it open?', answer: 'In 1904.' }],
            status: 'draft',
            applied: false,
          })
        : jsonResponse({ available: true, tools: [FAQ_TOOL] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <FaqSchemaPanel
        token="t"
        text="The museum opened in 1904."
        blockZone={null}
        onAcceptFaq={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Rédiger une FAQ' }))
    await screen.findByText('When did it open?')

    expect(screen.queryByRole('button', { name: 'Ajouter à la page' })).toBeNull()
  })
})

describe('the Schema.org draft', () => {
  it('is shown to read, never as something applied to the entry', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/run')
        ? jsonResponse({
            jsonLd: {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: 'The museum',
            },
            status: 'draft',
            applied: false,
          })
        : jsonResponse({ available: true, tools: [SCHEMA_TOOL] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <FaqSchemaPanel
        token="t"
        text="An article about the museum."
        blockZone={null}
        onAcceptFaq={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Rédiger des données structurées' }))

    expect(await screen.findByText(/"headline": "The museum"/u)).toBeDefined()
    // No accept button exists for this one at all — see the file's own note.
    expect(screen.queryByRole('button', { name: /accept|accepter|ajouter/iu })).toBeNull()
  })
})
