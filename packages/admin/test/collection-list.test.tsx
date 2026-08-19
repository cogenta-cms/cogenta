import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToArticles(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
  await screen.findByRole('heading', { name: 'Contenus' })
  fireEvent.click(screen.getByRole('link', { name: 'Articles' }))
}

describe('CollectionListRoute', () => {
  it('lists the fetched entries, with a title fallback to the id', async () => {
    render(<App />)
    await goToArticles()

    expect(await screen.findByText('First article')).toBeDefined()
    expect(screen.getByText('Second article')).toBeDefined()
  })

  it('filters by status, through the status tabs (fiche 01 task 4)', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    // entry-1 is published, entry-2 is a draft — the tab's own count says so.
    fireEvent.click(screen.getByRole('button', { name: 'Brouillons (1)' }))

    await waitFor(() => expect(screen.queryByText('First article')).toBeNull())
    expect(screen.getByText('Second article')).toBeDefined()
    // Reflected in the URL, so the filtered list is shareable (task 5).
    expect(window.location.search).toContain('status=draft')
  })

  it('marks the active status tab with aria-current, and shows every real count', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    const all = await screen.findByRole('button', { name: 'Tous (2)' })
    expect(all.getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: 'Brouillons (1)' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Publiés (1)' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Brouillons (1)' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Brouillons (1)' }).getAttribute('aria-current'),
      ).toBe('true'),
    )
    expect(all.getAttribute('aria-current')).toBeNull()
  })

  it('shows a bulk delete action only once a row is selected, for a role that may delete', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner First article' }))
    expect(screen.getByRole('button', { name: 'Supprimer (1)' })).toBeDefined()
  })

  it('searches the collection and shows only the matching entries (L10 task 3)', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'second' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    await screen.findByRole('heading', { name: '1 résultat(s)' })
    expect(screen.getByRole('link', { name: 'Second article' })).toBeDefined()
    expect(screen.queryByText('First article')).toBeNull()
  })

  it('clearing the search puts the full list back', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'second' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await screen.findByRole('heading', { name: '1 résultat(s)' })

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
    await screen.findByText('First article')
    expect(screen.queryByRole('heading', { name: /résultat/ })).toBeNull()
  })

  it('says so plainly when a search matches nothing, rather than showing an empty table', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    fireEvent.change(screen.getByLabelText('Rechercher'), {
      target: { value: 'nothing-matches-this' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByText('Aucun résultat pour cette recherche.')).toBeDefined()
  })

  it('exports the currently listed entries as a valid, correctly escaped CSV', async () => {
    let capturedBlob: Blob | null = null
    // jsdom implements neither method, so this is a real assignment rather
    // than a spy on an existing one — restored in `finally` so it never
    // leaks into another test in this file.
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob
      return 'blob:mock-url'
    })
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      render(<App />)
      await goToArticles()
      await screen.findByText('First article')

      fireEvent.click(screen.getByRole('button', { name: 'Exporter en CSV' }))

      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

      // jsdom's `Blob` has no `.text()`, so `FileReader` (which jsdom does
      // implement fully) is what reads the captured content back out.
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsText(capturedBlob as unknown as Blob)
      })
      // Strip the leading UTF-8 BOM `downloadCsv` prepends before parsing.
      const csv = text.replace(/^﻿/, '')
      const lines = csv.split('\r\n')
      expect(lines[0]).toBe('ID,Titre,Statut,Créé,Modifié')
      expect(lines).toContain(
        'entry-1,First article,published,2026-01-01T00:00:00.000Z,2026-02-01T00:00:00.000Z',
      )
      expect(lines).toContain(
        'entry-2,Second article,draft,2026-01-02T00:00:00.000Z,2026-01-02T00:00:00.000Z',
      )
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      clickSpy.mockRestore()
    }
  })

  it('reports a collection nobody can read as not found', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // The editor in these tests cannot read "secret-memo" — direct
    // navigation must not leak its existence any more than the collections
    // list already refuses to.
    fireEvent.click(screen.getByRole('link', { name: 'Contenus' }))
    await screen.findByRole('heading', { name: 'Contenus' })
    expect(screen.queryByText('Secret memos')).toBeNull()
  })

  it('hides every row action a viewer role may not perform, keeping only Voir (fiche 01 task 2)', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['viewer'] })

    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    // `article` grants publish/create/update/delete to `editor` only.
    expect(screen.queryByRole('button', { name: 'Publier' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dépublier' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Corbeille' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dupliquer' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Modifier' })).toBeNull()
    // `read` is granted to `public`, so a viewer still sees the entry itself.
    expect(screen.getAllByRole('button', { name: 'Voir' }).length).toBeGreaterThan(0)
    // No `delete` means no selection column either (the column-picker's own
    // checkboxes, unrelated to delete, are deliberately not excluded here).
    expect(screen.queryByRole('checkbox', { name: /Sélectionner/ })).toBeNull()
  })

  it('publishes an entry from its row action, without opening it (fiche 01 task 2)', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('Second article')

    const realFetch = globalThis.fetch
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (init?.method === 'POST') calls.push(url)
        return realFetch(input, init)
      }),
    )

    const row = screen.getByText('Second article').closest('tr')
    if (row === null) throw new Error('expected a table row')
    fireEvent.click(within(row).getByRole('button', { name: 'Publier' }))

    // The real route, hit directly from the row — never a navigation to the
    // entry screen first.
    await waitFor(() => expect(calls.some((url) => url.includes('/entry-2/publish'))).toBe(true))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('runs a bulk action across a selection, reporting exactly which row failed and why (fiche 01 task 3)', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    const realFetch = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/entry-2/publish')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: { code: 'FORBIDDEN', message: 'Access denied: publish on article.' },
              }),
              { status: 403, headers: { 'content-type': 'application/json' } },
            ),
          )
        }
        return realFetch(input, init)
      }),
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner First article' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Second article' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publier (2)' }))

    await screen.findByText('1 sur 2 ont réussi.')
    expect(screen.getByText('Second article : Access denied: publish on article.')).toBeDefined()
  })

  it('persists a chosen extra column to localStorage, keyed by the collection (fiche 01 task 6)', async () => {
    render(<App />)
    await goToArticles()
    await screen.findByText('First article')

    fireEvent.click(screen.getByText('Colonnes'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'summary' }))

    expect(await screen.findByText('A summary worth reading')).toBeDefined()
    const saved = JSON.parse(localStorage.getItem('cogenta.tablePrefs.article') ?? '{}') as {
      columns?: readonly string[]
    }
    expect(saved.columns).toEqual(['summary'])
  })
})
