import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

const RECENT = {
  id: 'notice-recent',
  code: 'test.recent',
  severity: 'info',
  dismissible: true,
  firstSeenAt: '2026-03-10T00:00:00.000Z',
  lastSeenAt: '2026-03-10T00:00:00.000Z',
  resolvedAt: null,
  readAt: null,
}

const OLD = {
  id: 'notice-old',
  code: 'test.old',
  severity: 'warning',
  dismissible: true,
  firstSeenAt: '2025-11-01T00:00:00.000Z',
  lastSeenAt: '2025-11-01T00:00:00.000Z',
  resolvedAt: null,
  readAt: null,
}

function signedIn(): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ noticeHistory: [RECENT, OLD] })
}

async function openCenter(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
  await screen.findByRole('dialog', { name: 'Notifications' })
}

/**
 * Fiche 35 audit T05 — the notification centre's own docstring already
 * claimed a period filter ("filtrable par sévérité et par période") that
 * was never actually built; only severity was. `since` is computed
 * client-side from now, exercised here against a real 90-days-old entry a
 * 30-day window must exclude.
 */
describe('the notification centre — period filter', () => {
  it('shows everything by default, both a recent and an old entry', async () => {
    signedIn()
    render(<App />)
    await openCenter()

    // `notices.test.recent.title` has no translation, so both the title and
    // body paragraphs fall back to the raw code — two matches per entry.
    expect((await screen.findAllByText('test.recent')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('test.old').length).toBeGreaterThan(0)
  })

  it('narrows to the last 30 days, dropping the old entry', async () => {
    signedIn()
    render(<App />)
    await openCenter()
    await screen.findAllByText('test.old')

    fireEvent.change(screen.getByLabelText('Filtrer par période'), {
      target: { value: '30' },
    })

    await screen.findAllByText('test.recent')
    expect(screen.queryAllByText('test.old')).toHaveLength(0)
  })

  it('combines the period filter with the existing severity filter', async () => {
    signedIn()
    render(<App />)
    await openCenter()
    await screen.findAllByText('test.old')

    fireEvent.change(screen.getByLabelText('Filtrer par sévérité'), {
      target: { value: 'warning' },
    })
    // `test.recent` is `info`, so the severity filter alone already drops
    // it — the period filter narrowing further to 30 days should then drop
    // `test.old` (an old `warning`) too, leaving nothing.
    await screen.findAllByText('test.old')
    fireEvent.change(screen.getByLabelText('Filtrer par période'), {
      target: { value: '30' },
    })

    expect(await screen.findByText("Rien pour l'instant.", { exact: false })).toBeDefined()
  })
})
