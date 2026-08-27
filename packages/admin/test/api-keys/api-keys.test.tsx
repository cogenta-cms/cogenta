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

describe('the API key list', () => {
  it('shows every key by name, prefix and scope, never the raw key', async () => {
    render(<App />)
    await goToApiKeys()

    const rows = within(await screen.findByRole('table'))
    expect(rows.getByText('CI pipeline')).toBeDefined()
    expect(rows.getByText('viewer')).toBeDefined()
    expect(rows.queryByText(/cogenta_sk_mock/u)).toBeNull()
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
      expect(within(table()).getByText('Révoquée')).toBeDefined()
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

describe('the API key list, for accessibility', () => {
  it('has no serious accessibility violation', async () => {
    const { container } = render(<App />)
    await goToApiKeys()
    await screen.findByText('CI pipeline')

    await expectNoSeriousA11yViolations(container)
  })
})
