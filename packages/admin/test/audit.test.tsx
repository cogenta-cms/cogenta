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
    // The "Exploitation" nav group is hidden for a role with no visible item
    // in it (fiche 35): there is no link to click, so go straight to the
    // route, the same way a bookmarked URL would.
    window.history.pushState(null, '', '/audit')

    render(<App />)

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

  it('resolves the actor to an email and localises the date, keeping the raw ISO in a title (L20 audit point 14)', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAudit()

    await screen.findByText('content.create')
    const table = within(screen.getByRole('table'))
    // The fixture's every row is `actorId: 'user-1'`, resolved through
    // `/api/users` the same best-effort way `trash.tsx`/`version-history.tsx`
    // already resolve an actor — the raw id must not be what shows. (The
    // topbar also shows `alice@example.com`, for the signed-in account
    // itself — this scopes to the table so that unrelated match does not
    // count toward the two rows.)
    expect(await table.findAllByText('alice@example.com')).toHaveLength(2)
    expect(table.queryByText('user-1')).toBeNull()

    // '2026-03-01T00:00:00.000Z' localised in French, not the raw ISO
    // string — but the ISO stays reachable as a `title` attribute rather
    // than disappearing.
    const dateCell = table.getByTitle('2026-03-01T00:00:00.000Z')
    expect(dateCell.textContent).not.toBe('2026-03-01T00:00:00.000Z')
    expect(dateCell.textContent).toMatch(/2026/)
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

    // Scoped to the modal: the table underneath now also resolves its own
    // `actorId` to this same email (L20 audit point 14), so the bare query
    // would match more than once.
    const dialog = within(await screen.findByRole('dialog'))
    expect(await dialog.findByText('alice@example.com')).toBeDefined()
    expect(await dialog.findByText('title')).toBeDefined()
    expect(dialog.getByText(/Before/)).toBeDefined()
    expect(dialog.getByText(/After/)).toBeDefined()
    // Still on the audit screen underneath — a modal (correctly marking the
    // rest of the page inert while open), never a route change.
    expect(document.body.textContent).toContain("Journal d'audit")
  })

  it('loads a further page of entries on demand, rather than all of them at once (fiche 67 task 1)', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    // 60 entries — past the screen's 50-entry page size, so a second page
    // genuinely exists to load.
    const auditEntries = Array.from({ length: 60 }, (_, index) => ({
      id: `bulk-${index}`,
      at: new Date(2026, 0, 1, 0, index).toISOString(),
      actorId: 'user-1',
      actorRoles: ['editor'],
      action: 'content.create',
      collection: 'article',
      entryId: `entry-${index}`,
      diff: null,
      version: 1,
      hash: `hash-${index}`,
      previousHash: null,
    }))
    installMockFetch({ roles: ['admin'], auditEntries })

    render(<App />)
    await goToAudit()

    // Newest first: entry 59 (the last minute) is on the first page, entry 0
    // (the earliest) is not — until "Charger plus" is clicked.
    await screen.findByText('entry-59')
    expect(screen.queryByText('entry-0')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Charger plus' }))

    await screen.findByText('entry-0')
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
