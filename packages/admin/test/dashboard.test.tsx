import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Fiche 39 tâche 2: the widget list/reorder/visibility controls moved from a
 * collapsed `<details>` (open in the DOM even collapsed, which is why older
 * tests below could once query it directly) into a modal opened by a
 * dedicated settings icon. Every test that drives that panel now opens it
 * first — the same underlying `prefs` mechanism, only its surface changed.
 */
function openDashboardSettings(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Personnaliser ce tableau de bord' }))
}

/** A `DataTransfer` good enough for the one format the dashboard's own drag-and-drop uses — the same technique `builder/preview-dom.test.ts` already relies on, since jsdom has no real `DataTransfer`. */
function fakeDataTransfer(): DataTransfer {
  const store = new Map<string, string>()
  return {
    getData: (format: string) => store.get(format) ?? '',
    setData: (format: string, data: string) => {
      store.set(format, data)
    },
  } as unknown as DataTransfer
}

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
    openDashboardSettings()

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
    openDashboardSettings()

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

    // The settings modal is still open, which marks the background `inert`
    // for assistive tech (Radix) — `hidden: true` looks past that to confirm
    // the card really did re-render behind it, the same thing a sighted user
    // would see the instant they close the panel.
    expect(
      await screen.findByRole('heading', { name: 'Résumé du contenu', hidden: true }),
    ).toBeDefined()
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
    openDashboardSettings()
    await screen.findByText('Widgets affichés sur le tableau de bord')

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

  it('dragging a card directly on the grid reorders it, without opening the settings panel (fiche 39 tâche 1)', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    const { unmount } = render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // The settings panel is never opened here — dragging the card itself is
    // the whole point of this task.
    expect(screen.queryByText('Widgets affichés sur le tableau de bord')).toBeNull()

    function gridHeadings(): readonly (string | null)[] {
      const grid = screen.getByRole('list', { name: 'Widgets du tableau de bord' })
      return Array.from(grid.querySelectorAll('li > section > h2')).map((h2) => h2.textContent)
    }

    const before = gridHeadings()
    expect(before[0]).toBe('Résumé du contenu')
    expect(before[1]).toBe('Santé du site')

    const summaryCard = screen
      .getByRole('heading', { name: 'Résumé du contenu' })
      .closest('li') as HTMLLIElement
    const healthCard = screen
      .getByRole('heading', { name: 'Santé du site' })
      .closest('li') as HTMLLIElement

    // Drag the health card and drop it before the summary card — the same
    // `dropBefore`/`reorderWidget`/`saveDashboardPrefs` primitive the
    // settings panel's own list already used, reached through the card
    // itself this time.
    const dataTransfer = fakeDataTransfer()
    fireEvent.dragStart(healthCard, { dataTransfer })
    fireEvent.drop(summaryCard, { dataTransfer })

    const after = gridHeadings()
    expect(after[0]).toBe('Santé du site')
    expect(after[1]).toBe('Résumé du contenu')

    // Persisted (`localStorage`), the same guarantee the settings panel's
    // own reorder already has — a reload keeps the new order.
    unmount()
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    expect(gridHeadings()[0]).toBe('Santé du site')
  })

  it('a drag gesture starting on a link or button inside a card acts on that control, not a card reorder', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const shortcut = await screen.findByRole('link', { name: 'Nouveau : Article' })
    const dataTransfer = fakeDataTransfer()
    fireEvent.dragStart(shortcut, { dataTransfer })

    // Nothing was staged for a card drop — the guard in `onDragStart`
    // recognised the gesture began on a real link and backed off, per the
    // fiche 39 piège: a card is only a drag target away from its own
    // interactive controls.
    expect(dataTransfer.getData('text/dashboard-widget')).toBe('')
  })

  it('the settings icon is a real, focusable button that opens the widget panel — reachable by keyboard and by mouse (fiche 39 tâche 2)', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // Nothing is behind a `<details>` repli any more: the panel does not
    // exist in the accessibility tree until this button is activated.
    expect(screen.queryByText('Widgets affichés sur le tableau de bord')).toBeNull()

    const settingsButton = screen.getByRole('button', { name: 'Personnaliser ce tableau de bord' })
    // A real `<button>`, not a `<div onClick>` — this is what actually makes
    // it Tab-reachable and Enter/Space-activatable by the platform, rather
    // than something this test would have to fake.
    expect(settingsButton.tagName).toBe('BUTTON')
    expect((settingsButton as HTMLButtonElement).disabled).toBe(false)

    settingsButton.focus()
    expect(document.activeElement).toBe(settingsButton)

    fireEvent.click(settingsButton)
    expect(await screen.findByText('Widgets affichés sur le tableau de bord')).toBeDefined()
  })

  it('the widget picker list shows the same icon as each card, not a bare name (fiche 39 tâche 3)', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    openDashboardSettings()
    await screen.findByText('Widgets affichés sur le tableau de bord')

    const row = screen
      .getByText('Résumé du contenu', { selector: 'span' })
      .closest('li') as HTMLLIElement
    expect(row.querySelector('svg')).not.toBeNull()

    // Remove it, so it shows up in the "available widgets" list too — that
    // list gets the same treatment, not just the visible one.
    fireEvent.click(
      screen.getByRole('button', { name: 'Retirer Résumé du contenu du tableau de bord' }),
    )
    const hiddenRow = screen
      .getByText('Résumé du contenu', { selector: 'span' })
      .closest('li') as HTMLLIElement
    expect(hiddenRow.querySelector('svg')).not.toBeNull()
  })
})
