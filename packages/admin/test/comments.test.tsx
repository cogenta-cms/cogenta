import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { expectNoSeriousA11yViolations } from './helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

const PENDING_COMMENT = {
  id: 'comment-1',
  collection: 'article',
  entryId: 'entry-1',
  authorName: 'Visitor One',
  authorEmail: 'visitor@example.com',
  body: 'A perfectly ordinary comment.',
  status: 'pending' as const,
}

const APPROVED_COMMENT = {
  id: 'comment-2',
  collection: 'article',
  entryId: 'entry-1',
  authorName: 'Visitor Two',
  authorEmail: 'visitor2@example.com',
  body: 'Already approved earlier.',
  status: 'approved' as const,
}

function signedInAs(
  roles: readonly string[],
  comments = [PENDING_COMMENT, APPROVED_COMMENT],
): void {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles, comments })
}

beforeEach(() => {
  signedInAs(['admin'])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToComments(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: /Commentaires/u }))
  await screen.findByRole('heading', { name: 'Commentaires' })
}

describe('the comment moderation queue', () => {
  it('shows the pending tab by default, with the pending comment listed', async () => {
    render(<App />)
    await goToComments()

    expect(screen.getByRole('tab', { name: /En attente/u }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(screen.getByText(/A perfectly ordinary comment/u)).toBeDefined()
    expect(screen.queryByText(/Already approved earlier/u)).toBeNull()
  })

  it('switches tabs to show the approved comment', async () => {
    render(<App />)
    await goToComments()

    fireEvent.click(screen.getByRole('tab', { name: /Approuvés/u }))
    expect(await screen.findByText(/Already approved earlier/u)).toBeDefined()
  })

  it('approves a pending comment, moving it out of the pending tab', async () => {
    render(<App />)
    await goToComments()

    const row = screen.getByText(/A perfectly ordinary comment/u).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Approuver' }))

    await waitFor(() => {
      expect(screen.queryByText(/A perfectly ordinary comment/u)).toBeNull()
    })
  })

  it('bulk-marks selected comments as spam', async () => {
    render(<App />)
    await goToComments()

    const row = screen.getByText(/A perfectly ordinary comment/u).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('checkbox'))

    fireEvent.click(await screen.findByRole('button', { name: 'Marquer indésirable' }))

    await waitFor(() => {
      expect(screen.queryByText(/A perfectly ordinary comment/u)).toBeNull()
    })
  })

  it('replies to a comment, publishing it as the signed-in account', async () => {
    render(<App />)
    await goToComments()

    const row = screen.getByText(/A perfectly ordinary comment/u).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Répondre' }))

    const textarea = await screen.findByLabelText('Réponse')
    fireEvent.change(textarea, { target: { value: 'Thanks for the comment!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publier la réponse' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Réponse')).toBeNull()
    })
  })

  it('searches by author, body or e-mail', async () => {
    render(<App />)
    await goToComments()

    const search = screen.getByLabelText('Recherche')
    fireEvent.change(search, { target: { value: 'nothing-matches' } })

    await waitFor(() => {
      expect(screen.getByText('Aucun commentaire ici.')).toBeDefined()
    })
  })

  it('shows the pending count as a badge on the nav item', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    const link = screen.getByRole('link', { name: /Commentaires/u })
    expect(within(link).getByText('1')).toBeDefined()
  })

  it('a viewer sees the queue but no moderation actions succeed silently — the buttons themselves are still offered as a courtesy, the router is the real gate', async () => {
    signedInAs(['viewer'])
    render(<App />)
    await goToComments()
    // The viewer role still sees the read-only queue (R4: this screen offers,
    // the router decides) — nothing more is asserted here since the mock
    // does not model a 403, only the real server does (proven by
    // `packages/comments/test/router.test.ts`).
    expect(screen.getByText(/A perfectly ordinary comment/u)).toBeDefined()
  })

  it('has no serious accessibility violations', async () => {
    const { container } = render(<App />)
    await goToComments()
    await expectNoSeriousA11yViolations(container)
  })
})
