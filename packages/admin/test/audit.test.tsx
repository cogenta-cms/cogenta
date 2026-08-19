import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToAudit(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: "Journal d'audit" }))
  await screen.findByRole('heading', { name: "Journal d'audit" })
}

describe('audit log', () => {
  it('refuses to show anything to a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })

    render(<App />)
    await goToAudit()

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('lists entries and reports chain integrity, for an admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAudit()

    expect(await screen.findByText('content.create')).toBeDefined()
    expect(screen.getByText('article')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Vérifier maintenant' }))
    expect(await screen.findByText(/Chaîne intacte/)).toBeDefined()
  })

  it('shows an entry detail with its diff, without navigating away (fiche 21 task 1)', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      auditDetail: {
        entry: {
          id: 'audit-1',
          at: '2026-03-01T00:00:00.000Z',
          actorId: 'user-1',
          actorRoles: ['editor'],
          action: 'content.update',
          collection: 'article',
          entryId: 'entry-1',
          diff: null,
          version: 2,
          hash: 'abc',
          previousHash: null,
        },
        actorKind: 'human',
        actorLabel: 'alice@example.com',
        diff: {
          fields: [{ field: 'title', change: 'changed', before: 'Before', after: 'After' }],
          blocks: [],
          changed: true,
        },
        diffUnavailable: null,
      },
    })

    render(<App />)
    await goToAudit()

    // The default fixture lists two entries (fiche 07 task 3 added a second,
    // `note`/`content.delete`, row) — both carry a "Détail" button, so the
    // query is scoped to `entry-1`'s own row rather than assuming there is
    // only one on the page.
    const entryRow = (await screen.findByText('entry-1')).closest('tr')
    if (entryRow === null) throw new Error('entry-1 row not found')
    fireEvent.click(within(entryRow).getByRole('button', { name: 'Détail' }))

    expect(await screen.findByText('alice@example.com')).toBeDefined()
    expect(await screen.findByText('title')).toBeDefined()
    expect(screen.getByText(/Before/)).toBeDefined()
    expect(screen.getByText(/After/)).toBeDefined()
    // Still on the audit screen underneath — a modal (correctly marking the
    // rest of the page inert while open), never a route change.
    expect(document.body.textContent).toContain("Journal d'audit")
  })

  it('shows the scheduled integrity check status alongside the manual button', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      auditIntegrity: {
        state: 'broken',
        checkpoint: null,
        entriesChecked: 3,
        lastCheckedAt: '2026-03-01T00:10:00.000Z',
        lastMode: 'incremental',
        lastFullCheckedAt: '2026-03-01T00:00:00.000Z',
        brokenAt: '2026-03-01T00:10:00.000Z',
        brokenEntryId: 'audit-2',
        brokenMessage: 'tampered',
      },
    })

    render(<App />)
    await goToAudit()

    expect(await screen.findByText(/audit-2/)).toBeDefined()
  })
})
