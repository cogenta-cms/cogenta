import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  await screen.findByText('First article')
}

describe('editing an existing entry', () => {
  it('loads the entry, generates one field per schema field, and saves an edit', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    const title = screen.getByLabelText('title', { exact: false }) as HTMLInputElement
    expect(title.value).toBe('First article')

    fireEvent.change(title, { target: { value: 'Updated title' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Enregistré.')
  })

  it('opens the real site URL a preview token was minted for, in a new tab', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser' }))

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1))
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/blog/first-article?state=working&preview=preview-token-1',
      '_blank',
      'noopener',
    )
  })

  it('reports a nonexistent entry rather than showing a blank form', async () => {
    // Direct navigation to an id the mock server does not have — no list
    // detour needed, since the point is what happens when the URL itself is
    // wrong (typed by hand, a stale bookmark).
    window.history.pushState(null, '', '/collections/article/does-not-exist')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
  })
})

/**
 * Status control and publication (the audit's top finding: the API route has
 * existed since L2, the admin never called it). Role gates are checked
 * server-side too — `packages/api/test/rest/publish-duplicate.test.ts` — this
 * file only proves the button does not even render for a role without the
 * permission, and that it calls the real route for one that has it.
 */
describe('status and publication', () => {
  it('shows the publish button and status selector to an editor, and publishes', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'Second article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    expect(screen.getByText('Brouillon')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Publier' }))

    expect(await screen.findByText('Statut changé en Publié.')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Publier' })).toBeNull()
  })

  it('moves a published entry back to draft through the status selector', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    fireEvent.change(screen.getByLabelText('Statut :'), { target: { value: 'draft' } })

    expect(await screen.findByText('Statut changé en Brouillon.')).toBeDefined()
  })

  it('hides the publish button and status selector from a role without publish', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['viewer'] })

    window.history.pushState(null, '', '/collections/article/entry-1')
    render(<App />)
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    expect(screen.queryByRole('button', { name: 'Publier' })).toBeNull()
    // The current status is still visible — just not editable.
    expect(screen.getByText('Publié')).toBeDefined()
    expect(screen.queryByLabelText('Statut :')).toBeNull()
  })
})

describe('duplicating an entry', () => {
  it('shows the duplicate button to a role that may create, and opens the new draft', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }))

    await waitFor(() => expect(window.location.pathname).toBe('/collections/article/entry-1-copy'))
    await screen.findByRole('heading', { name: 'Modifier : Article' })
    expect((screen.getByLabelText('title', { exact: false }) as HTMLInputElement).value).toBe(
      'First article',
    )
  })

  it('hides the duplicate button from a role without create', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['viewer'] })

    window.history.pushState(null, '', '/collections/article/entry-1')
    render(<App />)
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    expect(screen.queryByRole('button', { name: 'Dupliquer' })).toBeNull()
  })
})

describe('multilingual editing', () => {
  it('lists the site locales, and starts a translation seeded from the source entry', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ siteLocales: ['en', 'fr'] })

    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    await screen.findByRole('heading', { name: 'Traductions' })
    expect(screen.getByText('en (courant)')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'fr — créer la traduction' }))
    await screen.findByRole('heading', { name: 'Nouveau : Article' })

    expect(screen.getByText('fr')).toBeDefined()
    expect(screen.getByText('(nouvelle traduction)', { exact: false })).toBeDefined()
    expect((screen.getByLabelText('title', { exact: false }) as HTMLInputElement).value).toBe(
      'First article',
    )
  })
})

describe('creating a new entry', () => {
  it('shows the "Nouveau" link for a role that can create, and lands on the new entry after saving', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'Nouveau' }))
    await screen.findByRole('heading', { name: 'Nouveau : Article' })

    fireEvent.change(screen.getByLabelText('title', { exact: false }), {
      target: { value: 'Brand new article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Modifier : Article' })).toBeDefined(),
    )
  })
})

/**
 * Autosave (L13 task 5). What these prove is as much about what does *not*
 * happen: an autosave never reaches `PATCH /api/content/...`, so it never
 * writes a version row, so `history()` keeps meaning exactly what it means
 * today — every row in it is a save a human asked for.
 */
describe('autosaving a draft in progress', () => {
  const AUTOSAVE_KEY = 'cogenta.autosave.article.entry-1.en'

  function patchCallCount(): number {
    return vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH').length
  }

  async function openFirstArticle(): Promise<void> {
    render(<App />)
    await goToArticles()
    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })
  }

  function seedAutosave(at: string, title: string): void {
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ format: 1, at, values: { title }, blocks: {} }),
    )
  }

  it('keeps the draft in this browser on a timer, and sends nothing to the server', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await openFirstArticle()

      fireEvent.change(screen.getByLabelText('title', { exact: false }), {
        target: { value: 'Half a sentence' },
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000)
      })

      const stored = localStorage.getItem(AUTOSAVE_KEY)
      expect(stored).not.toBeNull()
      expect((JSON.parse(stored as string) as { values: { title: string } }).values.title).toBe(
        'Half a sentence',
      )
      // The whole point: no version was written, because no request was sent.
      expect(patchCallCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops the local copy once the entry is really saved', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await openFirstArticle()

      fireEvent.change(screen.getByLabelText('title', { exact: false }), {
        target: { value: 'Half a sentence' },
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000)
      })
      expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
      await screen.findByRole('status')

      expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull()
      expect(patchCallCount()).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('offers a newer local draft back, and applies it only when asked', async () => {
    // The mock entry was last saved on 2026-02-01.
    seedAutosave('2026-03-01T12:00:00.000Z', 'Recovered from a crashed tab')
    await openFirstArticle()

    // Never applied on its own — what the server holds is still what is shown.
    expect((screen.getByLabelText('title', { exact: false }) as HTMLInputElement).value).toBe(
      'First article',
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Les restaurer' }))
    expect((screen.getByLabelText('title', { exact: false }) as HTMLInputElement).value).toBe(
      'Recovered from a crashed tab',
    )
  })

  it('forgets a local draft the editor discards', async () => {
    seedAutosave('2026-03-01T12:00:00.000Z', 'Not wanted')
    await openFirstArticle()

    fireEvent.click(await screen.findByRole('button', { name: 'Les abandonner' }))

    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Les restaurer' })).toBeNull()
  })

  it('says nothing about a local draft older than the last real save', async () => {
    // Before the entry's 2026-02-01 updatedAt: it is already in the entry.
    seedAutosave('2026-01-15T12:00:00.000Z', 'Stale')
    await openFirstArticle()

    expect(screen.queryByRole('button', { name: 'Les restaurer' })).toBeNull()
  })
})
