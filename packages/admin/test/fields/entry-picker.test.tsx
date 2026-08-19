import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EntryPicker } from '../../src/fields/entry-picker.js'
import type { CollectionSummary } from '../../src/schema/types.js'

/**
 * `EntryPicker` on its own, with a small local `fetch` stub rather than the
 * shared `installMockFetch` helper — this suite tests one component's two
 * honesty rules (fiche 03 task 1's own wording: "affiche « accès refusé »,
 * pas une liste vide" and "une relation vers une entrée à la corbeille ne
 * doit pas disparaître de l'écran"), not the whole admin's routing or auth
 * flow, so it does not need that helper's much larger fixture.
 */

const TOKEN = 'test-token'

const READABLE: CollectionSummary = {
  name: 'person',
  labels: { singular: 'Person', plural: 'People' },
  permissions: { read: ['editor'], create: ['editor'], update: ['editor'], delete: ['editor'] },
  fields: [],
}

const UNREADABLE: CollectionSummary = {
  name: 'secret',
  labels: { singular: 'Secret', plural: 'Secrets' },
  permissions: { read: ['admin'] },
  fields: [],
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EntryPicker — permission', () => {
  it('shows an access-denied message for a collection this actor may not read, never an empty list', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <EntryPicker
        id="author"
        token={TOKEN}
        collection={UNREADABLE}
        roles={['editor']}
        many={false}
        value={[]}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert').textContent).toMatch(/Secrets/)
    // The whole point: nothing was even fetched, because the field never
    // pretends there is a list of zero entries to browse.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('names the unknown collection when the schema no longer declares it', () => {
    vi.stubGlobal('fetch', vi.fn())

    render(
      <EntryPicker
        id="author"
        token={TOKEN}
        collection={undefined}
        roles={['editor']}
        many={false}
        value={['some-id']}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toBeDefined()
  })
})

describe('EntryPicker — trashed references (ADR-0022)', () => {
  it('still shows a linked entry that has since been trashed, flagged rather than silently absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString()
        const parsed = new URL(url, 'http://localhost')
        const trashed = parsed.searchParams.get('trashed')

        if (trashed === 'only') {
          return json(200, {
            data: [
              {
                id: 'person-trashed',
                status: 'published',
                deletedAt: '2026-03-01T00:00:00.000Z',
                version: 1,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
                locale: 'en',
                translationOf: null,
                publishedAt: '2026-01-01T00:00:00.000Z',
                values: { name: 'Colette' },
                blocks: {},
              },
            ],
            page: { hasMore: false, nextCursor: null },
          })
        }
        // The live (non-trashed) lookup: the entry is gone from here, exactly
        // as it would be from a real server once it is in the trash.
        return json(200, { data: [], page: { hasMore: false, nextCursor: null } })
      }),
    )

    render(
      <EntryPicker
        id="author"
        token={TOKEN}
        collection={READABLE}
        // `delete` is what lets the picker reach into the trash at all
        // (ADR-0022: the same permission the trash screen itself needs).
        roles={['editor']}
        many={false}
        value={['person-trashed']}
        onChange={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByText('Colette')).toBeDefined())
    expect(screen.getByText(/corbeille|trash/i)).toBeDefined()
  })

  it('reports a reference it could not resolve at all, rather than dropping it from the value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { data: [], page: { hasMore: false, nextCursor: null } })),
    )

    render(
      <EntryPicker
        id="author"
        token={TOKEN}
        collection={READABLE}
        roles={['editor']}
        many={false}
        value={['ghost-id']}
        onChange={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByText(/ghost-id/)).toBeDefined())
  })
})
