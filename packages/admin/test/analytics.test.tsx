import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToAnalytics(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Statistiques' }))
  await screen.findByRole('heading', { name: 'Statistiques' })
}

describe('analytics dashboard', () => {
  it('refuses to show anything to a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })

    render(<App />)
    await goToAnalytics()

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows totals, top pages and top referrers, for an admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      analyticsSummary: {
        totalViews: 42,
        uniqueVisitors: 17,
        topPages: [{ path: '/home', views: 30 }],
        topReferrers: [{ domain: 'search.example', views: 10 }],
        deviceBreakdown: [
          { device: 'desktop', views: 25 },
          { device: 'mobile', views: 17 },
        ],
        dailyViews: [{ day: '2026-03-01', views: 42 }],
      },
    })

    render(<App />)
    await goToAnalytics()

    const totals = (await screen.findByRole('heading', { name: 'Totaux' })).closest(
      'section',
    ) as HTMLElement
    expect(totals.textContent).toContain('Vues')
    expect(totals.textContent).toContain('42')
    expect(totals.textContent).toContain('17')
    expect(screen.getByText('/home')).toBeDefined()
    expect(screen.getByText('search.example')).toBeDefined()
  })

  it('never renders a personal identifier — only the aggregate numbers the server sends', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      analyticsSummary: { totalViews: 1, uniqueVisitors: 1, topPages: [{ path: '/x', views: 1 }] },
    })

    render(<App />)
    await goToAnalytics()
    await screen.findByText('/x')

    // No raw IP-shaped or long-hex-hash-shaped text anywhere on the page —
    // this screen only ever receives and shows the aggregate the server
    // already stripped of anything identifying (see `@cogenta/analytics`'s
    // own privacy test suite for the storage-side half of this guarantee).
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)
    expect(body).not.toMatch(/\b[0-9a-f]{64}\b/)
  })

  it('switches the time window on request', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'], analyticsSummary: { totalViews: 5 } })

    render(<App />)
    await goToAnalytics()
    await screen.findByText(/5/)

    const sevenDayButton = screen.getByRole('button', { name: '7 jours' })
    fireEvent.click(sevenDayButton)
    expect(sevenDayButton.getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the period-over-period comparison as a percentage', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      analyticsSummary: { totalViews: 20, previousTotalViews: 10, viewsChangePercent: 100 },
    })

    render(<App />)
    await goToAnalytics()

    expect(await screen.findByText(/\+100%/)).toBeDefined()
  })

  it('says traffic is new rather than claiming 0% when there is no previous period', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      analyticsSummary: { totalViews: 5, previousTotalViews: 0, viewsChangePercent: null },
    })

    render(<App />)
    await goToAnalytics()

    expect(await screen.findByText(/nouveau/i)).toBeDefined()
  })

  it('shows the configured retention window', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'], analyticsSummary: { totalViews: 1, retentionDays: 90 } })

    render(<App />)
    await goToAnalytics()

    expect(await screen.findByText(/conservés 90 jours/)).toBeDefined()
  })

  it('links a resolved top page to its entry in the admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      analyticsSummary: {
        totalViews: 1,
        topPages: [
          { path: '/home', views: 1, title: 'Accueil', editHref: '/collections/page/abc-1' },
        ],
      },
    })

    render(<App />)
    await goToAnalytics()

    const link = await screen.findByRole('link', { name: 'Accueil' })
    expect(link.getAttribute('href')).toBe('/collections/page/abc-1')
  })

  it('rejects a custom range with the end date before the start date', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'], analyticsSummary: { totalViews: 1 } })

    render(<App />)
    await goToAnalytics()

    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-02-01' } })
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('précéder'),
    )
  })

  it('states what the system does not do', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'], analyticsSummary: { totalViews: 1 } })

    render(<App />)
    await goToAnalytics()

    expect(screen.getByText(/Aucun suivi inter-sites/)).toBeDefined()
    expect(screen.getByText(/Aucun identifiant persistant/)).toBeDefined()
    expect(screen.getByText(/Aucun profil individuel/)).toBeDefined()
    expect(screen.getByText(/Aucun partage avec un tiers/)).toBeDefined()
  })
})
