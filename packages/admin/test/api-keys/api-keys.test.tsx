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
    render(<App />)
    await goToApiKeys()

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
  it('marks it revoked after confirmation', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    )
    render(<App />)
    await goToApiKeys()
    await screen.findByText('CI pipeline')

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer CI pipeline' }))

    await waitFor(() => {
      expect(within(table()).getByText('Révoquée')).toBeDefined()
    })
  })

  it('does nothing without confirmation', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    )
    render(<App />)
    await goToApiKeys()
    await screen.findByText('CI pipeline')

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer CI pipeline' }))

    await waitFor(() => {
      expect(within(table()).getByText('Active')).toBeDefined()
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
