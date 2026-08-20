import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { expectNoSeriousA11yViolations } from './helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The review queue (`schema@2.1`, ADR-0027, fiche 37 task 3).
 *
 * `wf-article` (see `mock-fetch.ts`) has the workflow on, `update` scoped
 * `own: true` to `contributor`, `publish` held by `editor` — the fixture
 * that lets the "assigned to me" and "my submissions" tabs mean something
 * different from each other, and lets a role test actually prove R4.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToReview(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  // The "File de relecture" nav link only renders once the schema has loaded
  // far enough to know a collection turned the workflow on — wait for it
  // rather than assuming it's already there right after the dashboard
  // heading, the same race fixed for taxonomies.test.tsx and roles.test.tsx.
  fireEvent.click(await screen.findByRole('link', { name: 'File de relecture' }))
  await screen.findByRole('heading', { name: 'File de relecture' })
}

function signedIn(roles: readonly string[], pending = true): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles, ...(pending ? { wfEntryReviewState: 'pending' as const } : {}) })
}

describe('the review queue screen', () => {
  it('lists everything pending on the "all pending" tab, to a role that may publish', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToReview()

    fireEvent.click(screen.getByRole('tab', { name: 'Toutes en attente' }))
    expect(await screen.findByText('Workflow draft')).toBeDefined()
    expect(screen.getByText('wf-article')).toBeDefined()
  })

  it('approves a pending entry through the real route, and it leaves the queue', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToReview()

    fireEvent.click(screen.getByRole('tab', { name: 'Toutes en attente' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Approuver' }))

    expect(await screen.findByText('Rien ici.')).toBeDefined()
  })

  it('sends changes back through the real route, same reload discipline', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToReview()

    fireEvent.click(screen.getByRole('tab', { name: 'Toutes en attente' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Demander des modifications' }))

    expect(await screen.findByText('Rien ici.')).toBeDefined()
  })

  it('shows nothing on "assigned to me" for a role with no reviewable collection', async () => {
    signedIn(['viewer'])
    render(<App />)
    await goToReview()

    expect(await screen.findByText('Rien ici.')).toBeDefined()
  })

  it('meets the accessibility bar on every tab', async () => {
    signedIn(['editor'])
    const { container } = render(<App />)
    await goToReview()
    await expectNoSeriousA11yViolations(container)

    fireEvent.click(screen.getByRole('tab', { name: 'Toutes en attente' }))
    await screen.findByText('Workflow draft')
    await expectNoSeriousA11yViolations(container)
  })
})
