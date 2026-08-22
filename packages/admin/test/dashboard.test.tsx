import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dashboard', () => {
  it('hides site health and recent activity from a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // Site health, recent activity, and now the analytics widget — three
    // admin-only sections share this same restriction message.
    const restricted = await screen.findAllByText('Réservé au rôle « admin ».')
    expect(restricted).toHaveLength(3)
    expect(screen.queryByText(/sqlite/)).toBeNull()
  })

  it('shows real site health and recent activity to an admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    expect(await screen.findByText(/sqlite/)).toBeDefined()
    expect(screen.getByText(/local/)).toBeDefined()
    expect(await screen.findByText(/content\.create/)).toBeDefined()
  })

  it('shows the analytics widget with real totals, for an admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      analyticsSummary: { totalViews: 8, uniqueVisitors: 3 },
    })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    await screen.findByRole('heading', { name: 'Vues (7 derniers jours)' })
    expect(await screen.findByText(/Vues\s*:\s*8/)).toBeDefined()
    expect(screen.getByText(/Visiteurs uniques\s*:\s*3/)).toBeDefined()
  })

  it('leaves backups as an explicit empty placeholder, and removes CVE and Core Web Vitals rather than fabricate them', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    expect(await screen.findByRole('heading', { name: 'État des sauvegardes' })).toBeDefined()
    expect(screen.getByText(/uniquement en ligne de commande/u)).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'CVE ouvertes' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Core Web Vitals' })).toBeNull()
  })

  it('shows a content summary with clickable draft and total counts', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    await screen.findByRole('heading', { name: 'Résumé du contenu' })
    const draftLink = await screen.findByRole('link', { name: '1 brouillons' })
    expect(draftLink.getAttribute('href')).toBe('/collections/article?status=draft')
    const totalLink = screen.getByRole('link', { name: '2 au total' })
    expect(totalLink.getAttribute('href')).toBe('/collections/article')

    // `secret-memo` reads `admin` only — an `editor` here must never learn it exists.
    expect(screen.queryByText('Secret memo')).toBeNull()
  })

  it('gives a role without draft access the published count only, never a fabricated zero', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['viewer'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    await screen.findByRole('heading', { name: 'Résumé du contenu' })
    expect(screen.queryByRole('link', { name: /brouillons/u })).toBeNull()
    expect(screen.getByRole('link', { name: '1 au total' })).toBeDefined()
  })

  it('offers a "new article" shortcut only to a role that may create one', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const shortcut = await screen.findByRole('link', { name: 'Nouveau : Article' })
    expect(shortcut.getAttribute('href')).toBe('/collections/article/new')
  })

  it('hides the "new article" shortcut from a role that may not create', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['viewer'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    await screen.findByRole('heading', { name: 'Raccourcis' })
    expect(screen.queryByRole('link', { name: /Nouveau :/u })).toBeNull()
  })

  it("lists the signed-in editor's own draft in the to-do widget", async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    await screen.findByRole('heading', { name: 'À faire' })
    expect(await screen.findByText('Second article')).toBeDefined()
  })

  it('remembers a removed widget across a reload', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    const { unmount } = render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const remove = await screen.findByRole('button', {
      name: 'Retirer Résumé du contenu du tableau de bord',
    })
    fireEvent.click(remove)
    expect(screen.queryByRole('heading', { name: 'Résumé du contenu' })).toBeNull()

    unmount()
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    expect(screen.queryByRole('heading', { name: 'Résumé du contenu' })).toBeNull()
  })

  it('a widget removed entirely can be added back from the picker list (fiche 22 tâche 8, part 2)', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // Not just hidden — genuinely off the dashboard, and offered back from a
    // dedicated "available widgets" list rather than a checkbox that still
    // named it among the visible ones.
    const remove = await screen.findByRole('button', {
      name: 'Retirer Résumé du contenu du tableau de bord',
    })
    fireEvent.click(remove)
    expect(screen.queryByRole('heading', { name: 'Résumé du contenu' })).toBeNull()

    const add = await screen.findByRole('button', {
      name: 'Ajouter Résumé du contenu au tableau de bord',
    })
    fireEvent.click(add)

    expect(await screen.findByRole('heading', { name: 'Résumé du contenu' })).toBeDefined()
    expect(
      screen.queryByRole('button', { name: 'Ajouter Résumé du contenu au tableau de bord' }),
    ).toBeNull()
  })

  it('reorders only among the widgets actually on the dashboard', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    function widgetNames(): readonly (string | null)[] {
      // `{ selector: 'span' }` disambiguates from the widget's own `<h2>`
      // heading, which shares the exact same text.
      const list = screen
        .getByText('Résumé du contenu', { selector: 'span' })
        .closest('ul') as HTMLUListElement
      return Array.from(list.querySelectorAll('li > span:first-child')).map(
        (node) => node.textContent,
      )
    }

    const before = widgetNames()
    expect(before[0]).toBe('Résumé du contenu')

    // The first item's "up" button is disabled (nothing above it); the
    // second item's "up" button swaps it with the first — reusing
    // `reorderWidget` against the *visible* list only, never a raw swap
    // against the full stored order (which could include a hidden widget in
    // between and silently do nothing the reader can see).
    const list = screen
      .getByText('Résumé du contenu', { selector: 'span' })
      .closest('ul') as HTMLUListElement
    const secondItem = list.querySelectorAll('li')[1] as HTMLLIElement
    fireEvent.click(within(secondItem).getByRole('button', { name: 'Monter' }))

    const after = widgetNames()
    expect(after[0]).toBe(before[1])
    expect(after[1]).toBe(before[0])
  })
})
