import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

function signedInAs(roles: readonly string[]): void {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles })
}

beforeEach(() => {
  signedInAs(['admin'])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToApiKeys(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Clés API' }))
  await screen.findByRole('heading', { name: 'Clés API' })
}

function table(): HTMLElement {
  return screen.getByRole('table')
}

/**
 * Fiche 62: the seed now includes a second, already-revoked key ("Old
 * integration") so the purge screen has something to purge without faking
 * time — which means "Révoquée" is no longer unique in the table the moment
 * a second key is revoked. Row-scoped queries are what keep these tests
 * asserting the right key's status rather than "a" status.
 */
function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest('tr') as HTMLElement
}

describe('the API key list', () => {
  it('shows every key by name, prefix and scope, never the raw key', async () => {
    render(<App />)
    await goToApiKeys()

    const rows = within(await screen.findByRole('table'))
    expect(rows.getByText('CI pipeline')).toBeDefined()
    // Both seeded keys are scoped to "viewer" (fiche 62 added a second,
    // already-revoked key for the purge tests), so this is no longer unique
    // to a single row — assert it appears on the row that matters.
    expect(within(rowFor('CI pipeline')).getByText('viewer')).toBeDefined()
    expect(rows.queryByText(/cogenta_sk_mock/u)).toBeNull()
  })

  /**
   * T09-03 — the scope detail used to live only in a `title=` hover
   * attribute, unreachable without a mouse. It is now a native `<details>`
   * disclosure: natively focusable (no ARIA, no explicit `tabindex`) and
   * activatable without a pointer, exactly the way `Enter`/`Space` on a
   * focused `<summary>` behaves in every real browser.
   */
  it('makes the scope detail reachable by keyboard, not only a hover title', async () => {
    render(<App />)
    await goToApiKeys()
    await screen.findByText('CI pipeline')

    const summary = within(rowFor('CI pipeline')).getByText('viewer')
    const details = summary.closest('details') as HTMLDetailsElement
    expect(details).not.toBeNull()
    expect(details.open).toBe(false)

    summary.focus()
    expect(document.activeElement).toBe(summary)

    fireEvent.click(summary)

    expect(details.open).toBe(true)
    expect(within(details).getByText(/Articles: read/u)).toBeDefined()
  })

  it('tells a non-admin plainly instead of rendering controls that would be refused', async () => {
    signedInAs(['editor'])
    // The "Comptes" nav group is hidden for a role with no visible item in
    // it (fiche 35): there is no link to click, so go straight to the
    // route, the same way a bookmarked URL would.
    window.history.pushState(null, '', '/api-keys')
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Réservé au rôle « admin » : cette page crée et révoque des identifiants machine.',
    )
    expect(screen.queryByRole('button', { name: 'Nouvelle clé API' })).toBeNull()
  })
})

describe('creating an API key', () => {
  it('creates it and shows the raw key exactly once', async () => {
    render(<App />)
    await goToApiKeys()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle clé API' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer une clé API' })

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Analytics import' } })
    fireEvent.change(screen.getByLabelText('Portée'), { target: { value: 'editor' } })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    expect(await screen.findByText(/^cogenta_sk_mock/u)).toBeDefined()
    await waitFor(() => {
      expect(within(table()).getByText('Analytics import')).toBeDefined()
    })
  })

  it('hides the key again once it has been noted', async () => {
    render(<App />)
    await goToApiKeys()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle clé API' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer une clé API' })
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Analytics import' } })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)
    const rawKey = (await screen.findByText(/^cogenta_sk_mock/u)).textContent

    fireEvent.click(screen.getByRole('button', { name: 'Masquer la clé' }))

    await waitFor(() => {
      expect(screen.queryByText(rawKey ?? '')).toBeNull()
    })
  })
})

describe('revoking an API key', () => {
  it('marks it revoked after confirmation, through the design system modal rather than confirm()', async () => {
    render(<App />)
    await goToApiKeys()
    await screen.findByText('CI pipeline')

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer CI pipeline' }))
    const dialog = await screen.findByRole('dialog', { name: 'Révoquer CI pipeline ?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer la clé' }))

    await waitFor(() => {
      expect(within(rowFor('CI pipeline')).getByText('Révoquée')).toBeDefined()
    })
  })

  it('does nothing when the modal is cancelled', async () => {
    render(<App />)
    await goToApiKeys()
    await screen.findByText('CI pipeline')

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer CI pipeline' }))
    const dialog = await screen.findByRole('dialog', { name: 'Révoquer CI pipeline ?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Révoquer CI pipeline ?' })).toBeNull()
    })
    expect(within(table()).getByText('Active')).toBeDefined()
  })
})

describe('rotating an API key (fiche 20 task 2)', () => {
  it('mints a replacement and shows it exactly once, without revoking the original', async () => {
    render(<App />)
    await goToApiKeys()
    await screen.findByText('CI pipeline')

    fireEvent.click(screen.getByRole('button', { name: 'Faire tourner CI pipeline' }))
    const dialog = await screen.findByRole('dialog', { name: 'Faire tourner CI pipeline' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Faire tourner la clé' }))

    expect(await screen.findByText(/^cogenta_sk_mock-rotated/u)).toBeDefined()
    await waitFor(() => {
      expect(within(table()).getByText('En sursis')).toBeDefined()
    })
  })
})

describe('pagination (fiche 67 task 5)', () => {
  it('loads a further page of keys on demand, rather than all of them at once', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    // The seed already has one key ("CI pipeline") — thirty more push the
    // total past the screen's page size (25), so a second page exists.
    for (let index = 0; index < 30; index += 1) {
      await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${VALID_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: `Extra key ${index}`, scope: ['viewer'] }),
      })
    }

    await goToApiKeys()
    await screen.findByText('CI pipeline')

    // Still on the first page: the most recently created key is not shown yet.
    expect(screen.queryByText('Extra key 29')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Charger plus' }))

    await waitFor(() => {
      expect(screen.getByText('Extra key 29')).toBeDefined()
    })
  })
})

describe('recovering a revoked key (fiche 62 task 3, decision b)', () => {
  it('mints a replacement without lifting the original out of "Révoquée"', async () => {
    render(<App />)
    await goToApiKeys()
    await screen.findByText('CI pipeline')

    // Revoked by the mock just now, so it is inside the 24h recovery window.
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer CI pipeline' }))
    const revokeDialog = await screen.findByRole('dialog', { name: 'Révoquer CI pipeline ?' })
    fireEvent.click(within(revokeDialog).getByRole('button', { name: 'Révoquer la clé' }))
    await waitFor(() => {
      expect(within(rowFor('CI pipeline')).getByText('Révoquée')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Récupérer CI pipeline' }))
    const recoverDialog = await screen.findByRole('dialog', { name: 'Récupérer CI pipeline' })
    fireEvent.click(
      within(recoverDialog).getByRole('button', { name: 'Créer une clé de remplacement' }),
    )

    expect(await screen.findByText(/^cogenta_sk_mock-recovered/u)).toBeDefined()
    await waitFor(() => {
      // Two rows now share the name "CI pipeline" — the original, still
      // revoked, and the fresh replacement. The original (listed first,
      // matching insertion order) is what must still read "Révoquée" —
      // recover is never a reactivation.
      const rows = screen.getAllByText('CI pipeline').map((el) => el.closest('tr') as HTMLElement)
      expect(rows).toHaveLength(2)
      expect(within(rows[0] as HTMLElement).getByText('Révoquée')).toBeDefined()
    })
  })

  it('does not offer recovery for a key revoked long ago', async () => {
    render(<App />)
    await goToApiKeys()
    await screen.findByText('Old integration')

    expect(screen.queryByRole('button', { name: 'Récupérer Old integration' })).toBeNull()
  })
})

describe('purging a long-revoked key (fiche 62 task 2)', () => {
  it('removes it from the list after confirmation', async () => {
    render(<App />)
    await goToApiKeys()
    await screen.findByText('Old integration')

    fireEvent.click(screen.getByRole('button', { name: 'Purger Old integration' }))
    const dialog = await screen.findByRole('dialog', { name: 'Purger Old integration ?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Purger la clé' }))

    await waitFor(() => {
      expect(screen.queryByText('Old integration')).toBeNull()
    })
  })

  it('offers no purge button yet for a key revoked moments ago, only a countdown', async () => {
    render(<App />)
    await goToApiKeys()
    await screen.findByText('CI pipeline')

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer CI pipeline' }))
    const dialog = await screen.findByRole('dialog', { name: 'Révoquer CI pipeline ?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer la clé' }))
    await waitFor(() => {
      expect(within(rowFor('CI pipeline')).getByText('Révoquée')).toBeDefined()
    })

    expect(screen.queryByRole('button', { name: 'Purger CI pipeline' })).toBeNull()
    expect(within(rowFor('CI pipeline')).getByText('Purgeable dans 30 jour(s)')).toBeDefined()
  })
})

describe('the API key list, for accessibility', () => {
  it('has no serious accessibility violation', async () => {
    const { container } = render(<App />)
    await goToApiKeys()
    await screen.findByText('CI pipeline')

    await expectNoSeriousA11yViolations(container)
  })
})
