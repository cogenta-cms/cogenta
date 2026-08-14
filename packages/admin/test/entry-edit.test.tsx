import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
