import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The trash screen (`schema@2.0`, ADR-0022; fiche 07 — "Corbeille").
 *
 * `article` and `note` both grant `delete` to `editor` in the fixture, so an
 * editor sees the trash of both and a viewer sees neither — the R4 half of
 * these tests: the UI follows the declared permissions, and the server
 * refuses regardless.
 *
 * Fixture recap (`mock-fetch.ts`): `article`'s trash holds "Thrown away"
 * (published, restores and purges cleanly) and "Still referenced elsewhere"
 * (draft, whose `untrash` always 404s and whose `purge` always 409s —
 * fiche 07 task 2's partial-failure report). `note`'s own, separate trash
 * holds "A note nobody kept". The screen opens on the "All" tab by default,
 * so most tests below see all three rows unless they switch tabs.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToTrash(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Corbeille' }))
  await screen.findByRole('heading', { name: 'Corbeille' })
}

function signedIn(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles })
}

/** The `<tr>` whose text content includes the given entry title — rows are otherwise indistinguishable by role alone. */
function rowFor(title: string): HTMLElement {
  const rows = screen.getAllByRole('row')
  const found = rows.find((row) => within(row).queryByText(title) !== null)
  if (found === undefined) throw new Error(`no row for "${title}"`)
  return found
}

describe('the trash screen', () => {
  it('lists what was deleted, across every collection this actor may empty, with the status it had when it was deleted', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTrash()

    // The default "All" tab (task 1): three rows from two collections,
    // never needing to switch anything to see them.
    expect(await screen.findByText('Thrown away')).toBeDefined()
    expect(screen.getByText('Still referenced elsewhere')).toBeDefined()
    expect(screen.getByText('A note nobody kept')).toBeDefined()

    // Not "draft": deletedAt is orthogonal to status (ADR-0022), so a
    // published entry in the trash still reads published — and comes back
    // that way.
    expect(within(rowFor('Thrown away')).getByText('published')).toBeDefined()
    // The exact instant lives in the `title` attribute, not as visible text
    // — the visible cell is a relative time that would drift with the real
    // clock if asserted literally.
    expect(screen.getByTitle('2026-03-01T00:00:00.000Z')).toBeDefined()

    // The "All" tab's own column, absent from a single-collection view.
    expect(screen.getByText('Collection')).toBeDefined()
    expect(within(rowFor('Thrown away')).getByText('Articles')).toBeDefined()
    expect(within(rowFor('A note nobody kept')).getByText('Notes')).toBeDefined()

    // Never a status filter: the trash is not a `status` value (ADR-0022).
    expect(screen.queryByText('Statut')).toBeNull()
  })

  it('shows a count on each collection tab', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTrash()

    expect(await screen.findByRole('button', { name: 'Articles (2)' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Notes (1)' })).toBeDefined()
  })

  it('says how many days remain before the automatic purge, and when it last swept, for an admin', async () => {
    signedIn(['editor', 'admin'])
    render(<App />)
    await goToTrash()

    // `article` keeps its trash 30 days, `note` only 7 — the "All" tab is
    // honest about the range rather than picking one.
    await screen.findByText(
      'La corbeille de chaque collection se vide automatiquement — après 7–30 jours, selon la collection.',
    )
    expect(await screen.findByText(/Dernier balayage automatique/)).toBeDefined()

    // Every fixture row was deleted well over 30 days before "today" in this
    // suite's clock, so the purge window has already elapsed — "due", not a
    // countdown, and not an error state either.
    expect(within(rowFor('Thrown away')).getByText('en attente de purge')).toBeDefined()
  })

  it('shows the schema-only banner and no "last swept" line for a non-admin, and no "deleted by" column at all', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTrash()

    await screen.findByText(
      'La corbeille de chaque collection se vide automatiquement — après 7–30 jours, selon la collection.',
    )
    expect(screen.queryByText(/Dernier balayage automatique/)).toBeNull()
    expect(screen.queryByText('Supprimée par')).toBeNull()
  })

  it('names who deleted an entry, for an admin, linking nothing it cannot back up', async () => {
    signedIn(['editor', 'admin'])
    render(<App />)
    await goToTrash()

    await screen.findByText('A note nobody kept')
    // The audit log records `content.delete` for this one (fiche 07 closed
    // the gap where `untrash`/`purge` were not audited either — see
    // `serve-trash.test.ts` for the server-side proof). No such record
    // exists for "Thrown away" in this fixture, which must read honestly
    // empty rather than inventing an author.
    expect(within(rowFor('A note nobody kept')).getByText('user-1')).toBeDefined()
    expect(within(rowFor('Thrown away')).getByText('—')).toBeDefined()
  })

  it('restores an entry through the real untrash route, leaving the rest of the trash alone', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTrash()

    await screen.findByText('Thrown away')
    fireEvent.click(within(rowFor('Thrown away')).getByRole('button', { name: 'Restaurer' }))

    // Gone from the trash because the server no longer holds it there —
    // gone specifically, not "the trash is empty": two other rows remain.
    await waitFor(() => {
      expect(screen.queryByText('Thrown away')).toBeNull()
    })
    expect(screen.getByText('Still referenced elsewhere')).toBeDefined()
    expect(screen.getByText('A note nobody kept')).toBeDefined()
  })

  it('opens the design system modal before purging, never globalThis.confirm()', async () => {
    const confirmSpy = vi.fn()
    vi.stubGlobal('confirm', confirmSpy)
    signedIn(['editor'])
    render(<App />)
    await goToTrash()

    await screen.findByText('Thrown away')
    fireEvent.click(
      within(rowFor('Thrown away')).getByRole('button', { name: 'Supprimer définitivement' }),
    )

    expect(await screen.findByText('Supprimer 1 entrée définitivement ?')).toBeDefined()
    expect(confirmSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    // Refused at the confirmation: nothing was sent, and the entry is still there.
    expect(screen.getByText('Thrown away')).toBeDefined()
  })

  it('purges for good once the modal is confirmed', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTrash()

    await screen.findByText('Thrown away')
    fireEvent.click(
      within(rowFor('Thrown away')).getByRole('button', { name: 'Supprimer définitivement' }),
    )
    await screen.findByText('Supprimer 1 entrée définitivement ?')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 1 entrée définitivement' }))

    await waitFor(() => {
      expect(screen.queryByText('Thrown away')).toBeNull()
    })
    expect(await screen.findByText('1 entrée supprimée définitivement.')).toBeDefined()
  })

  it('restores a selection, naming the one restore a real server refusal blocks (fiche 07 task 2)', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTrash()

    await screen.findByText('Thrown away')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner « Thrown away »' }))
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Sélectionner « Still referenced elsewhere »' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer la sélection (2)' }))

    expect(await screen.findByText('1 entrée restaurée.')).toBeDefined()
    // Scoped to the report `Notice` (`role="status"`), not `getByRole('list')`
    // alone — the sidebar navigation is a list too.
    const restoreReport = screen.getByRole('status')
    expect(within(restoreReport).getByText("1 n'a pas pu être traitée :")).toBeDefined()
    // The server's own message, named rather than swallowed — this is the
    // whole point of the report (fiche 07 task 2).
    expect(within(restoreReport).getByText(/is not in the "article" trash/)).toBeDefined()

    // The one that actually restored is gone from the trash; the blocked one
    // — still visibly in the table below, untouched — is why the report
    // exists rather than a single pass/fail toast.
    expect(screen.queryByText('Thrown away')).toBeNull()
    expect(screen.getByText('Still referenced elsewhere')).toBeDefined()
  })

  it('deletes a selection for good, naming the one purge a real restrict-style refusal blocks', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTrash()

    await screen.findByText('Thrown away')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner « Thrown away »' }))
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Sélectionner « Still referenced elsewhere »' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Supprimer définitivement la sélection (2)' }),
    )

    await screen.findByText('Supprimer 2 entrées définitivement ?')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 2 entrées définitivement' }))

    expect(await screen.findByText('1 entrée supprimée définitivement.')).toBeDefined()
    const purgeReport = screen.getByRole('status')
    expect(within(purgeReport).getByText(/cannot be removed from "article"/)).toBeDefined()
    expect(screen.queryByText('Thrown away')).toBeNull()
    // Refused, so still there — purging is not silently retried or skipped.
    expect(screen.getByText('Still referenced elsewhere')).toBeDefined()
  })

  it("empties a single collection's trash with the exact total, through the same confirmation", async () => {
    signedIn(['editor'])
    render(<App />)
    await goToTrash()

    fireEvent.click(await screen.findByRole('button', { name: 'Notes (1)' }))
    await screen.findByText('A note nobody kept')

    fireEvent.click(screen.getByRole('button', { name: 'Vider la corbeille de cette collection' }))
    expect(await screen.findByText('Vider la corbeille de « Notes » ?')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 1 entrée définitivement' }))

    await waitFor(() => {
      expect(screen.queryByText('A note nobody kept')).toBeNull()
    })
    expect(await screen.findByText('1 entrée supprimée définitivement.')).toBeDefined()
  })

  it('offers no collection at all to a role that may not delete', async () => {
    signedIn(['viewer'])
    render(<App />)
    await goToTrash()

    expect(
      await screen.findByText("Aucune collection que vous puissiez supprimer n'a de corbeille."),
    ).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
