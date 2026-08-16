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
})
