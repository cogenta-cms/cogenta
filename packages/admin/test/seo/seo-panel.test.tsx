import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CollectionSummary } from '../../src/schema/types.js'
import { SeoPanel } from '../../src/seo/seo-panel.js'

/**
 * Fiche 13 (SEO éditorial), Task 1 — the entry-level panel, mounted directly
 * rather than through `<App/>` (the same isolation `FaqSchemaPanel`'s own
 * suite uses): a self-contained component, its own fetch mock, no shared
 * harness to drift out of sync with the entry-editor fiche running in
 * parallel.
 *
 * The central property under test throughout: the rendered "aperçu" is
 * always whatever `POST /api/seo/preview` answered, verbatim — never a
 * client-side recomputation. Several assertions check this by having the
 * mock answer something a naive client-side truncation would never produce.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function field(
  name: string,
  kind: CollectionSummary['fields'][number]['kind'],
  options: Record<string, unknown> = {},
): CollectionSummary['fields'][number] {
  return {
    name,
    kind,
    required: false,
    localized: false,
    unique: false,
    hasCustomValidation: false,
    options,
  }
}

const PLAIN_COLLECTION: CollectionSummary = {
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  permissions: {},
  fields: [field('title', 'text')],
}

const SEO_COLLECTION: CollectionSummary = {
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  permissions: {},
  fields: [
    field('title', 'text'),
    field('seoTitle', 'text'),
    field('seoDescription', 'text'),
    field('seoNoindex', 'boolean'),
  ],
}

const NO_PROVIDER = { available: false, tools: [] }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a collection with no SEO override fields', () => {
  it('renders nothing at all', () => {
    const { container } = render(
      <SeoPanel
        token="t"
        collection={PLAIN_COLLECTION}
        entryId={null}
        status="draft"
        values={{}}
        entryText=""
        onChange={vi.fn()}
      />,
    )
    expect(container.innerHTML).toBe('')
  })
})

describe('the SEO panel on a collection that declares the convention fields', () => {
  it('shows the title and description editors with a live character count', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(NO_PROVIDER)),
    )
    render(
      <SeoPanel
        token="t"
        collection={SEO_COLLECTION}
        entryId={null}
        status="draft"
        values={{ seoTitle: 'Hello' }}
        entryText=""
        onChange={vi.fn()}
      />,
    )

    expect((screen.getByLabelText('Titre SEO') as HTMLInputElement).value).toBe('Hello')
    expect(screen.getByText('5 / 60')).toBeDefined()
  })

  it('calls onChange with the typed value, never applying anything on its own', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(NO_PROVIDER)),
    )
    const onChange = vi.fn()
    render(
      <SeoPanel
        token="t"
        collection={SEO_COLLECTION}
        entryId={null}
        status="draft"
        values={{}}
        entryText=""
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Titre SEO'), { target: { value: 'A new title' } })
    expect(onChange).toHaveBeenCalledWith('seoTitle', 'A new title')
  })

  it('warns when noindex is turned on for an already-published entry', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(NO_PROVIDER)),
    )
    render(
      <SeoPanel
        token="t"
        collection={SEO_COLLECTION}
        entryId={null}
        status="published"
        values={{ seoNoindex: true }}
        entryText=""
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('publiée')
  })

  it('says to save first, and never calls the preview route, for an entry with no id yet', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => jsonResponse(NO_PROVIDER))
    vi.stubGlobal('fetch', fetchMock)
    render(
      <SeoPanel
        token="t"
        collection={SEO_COLLECTION}
        entryId={null}
        status="draft"
        values={{}}
        entryText=""
        onChange={vi.fn()}
      />,
    )

    await screen.findAllByText("Enregistrez d'abord l'entrée pour voir l'aperçu réel.")
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/seo/preview'))).toBe(
      false,
    )
  })
})

describe('the live preview', () => {
  it('renders exactly what the server computed — never a client-side recomputation', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.includes('/api/seo/preview')) {
        return jsonResponse({
          title: 'A title only the server could have produced — 12345',
          titleLength: 47,
          description: 'A description only the server could have produced.',
          descriptionLength: 53,
          canonical: 'https://example.com/hello-world',
          robots: 'index',
          image: null,
          ogTitle: 'A title only the server could have produced — 12345',
          ogDescription: null,
        })
      }
      return jsonResponse(NO_PROVIDER)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <SeoPanel
        token="t"
        collection={SEO_COLLECTION}
        entryId="entry-1"
        status="draft"
        values={{ seoTitle: 'Hello' }}
        entryText=""
        onChange={vi.fn()}
      />,
    )

    await screen.findByText('A title only the server could have produced — 12345')
    expect(screen.getByText('A description only the server could have produced.')).toBeDefined()
    expect(screen.getByText('https://example.com/hello-world')).toBeDefined()

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/seo/preview'))).toBe(
      true,
    )
  })

  it('shows the noindex warning the server reports, without asserting it itself', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) =>
        String(url).includes('/api/seo/preview')
          ? jsonResponse({
              title: 'Draft',
              titleLength: 5,
              description: null,
              descriptionLength: 0,
              canonical: null,
              robots: 'noindex',
              image: null,
              ogTitle: 'Draft',
              ogDescription: null,
            })
          : jsonResponse(NO_PROVIDER),
      ),
    )

    render(
      <SeoPanel
        token="t"
        collection={SEO_COLLECTION}
        entryId="entry-1"
        status="draft"
        values={{}}
        entryText=""
        onChange={vi.fn()}
      />,
    )

    await screen.findByText(
      'Cet aperçu montre une copie non enregistrée ou non publiée, donc il porte toujours noindex — la page réelle différera une fois publiée.',
    )
  })
})

describe('R2 — the panel works without any AI provider, and hides the AI shortcuts', () => {
  it('never shows a "propose a title" button when the assistant is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(NO_PROVIDER)),
    )
    render(
      <SeoPanel
        token="t"
        collection={SEO_COLLECTION}
        entryId={null}
        status="draft"
        values={{}}
        entryText="Some page content."
        onChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Proposer un titre' })).toBeNull()
    })
  })

  it('shows it, and fills the field only on an explicit click, when the assistant is available', async () => {
    const TITLES_TOOL = {
      tool: 'assist.titles',
      label: 'Propose titles',
      description: 'Propose titles.',
      cost: 'low',
      needs: [],
    }
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.endsWith('/run')) {
        return jsonResponse({ suggestions: ['A proposed title'], applied: false })
      }
      if (href.includes('/api/assistant')) {
        return jsonResponse({ available: true, tools: [TITLES_TOOL] })
      }
      return jsonResponse(NO_PROVIDER)
    })
    vi.stubGlobal('fetch', fetchMock)

    const onChange = vi.fn()
    render(
      <SeoPanel
        token="t"
        collection={SEO_COLLECTION}
        entryId={null}
        status="draft"
        values={{}}
        entryText="Some page content."
        onChange={onChange}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Proposer un titre' }))
    fireEvent.click(await screen.findByText('A proposed title'))

    expect(onChange).toHaveBeenCalledWith('seoTitle', 'A proposed title')
  })
})
