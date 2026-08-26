import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * L21 task 6 — the "MCP" admin screen, parallel to "Agents" and separate
 * from the generic "Clés API" screen. It mints credentials through the
 * exact same `/api/api-keys` endpoint `api-keys.tsx` already uses (see
 * `mock-fetch.ts`'s single `apiKeysMatch` stub, shared by both screens'
 * tests) — nothing here stands up a second store. What is genuinely new,
 * and what these tests actually cover, is the ready-to-paste client
 * configuration shown once, right alongside the raw key.
 */

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
  // jsdom has no real Clipboard API — stub the one method this screen calls.
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToMcp(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Serveur MCP' }))
  await screen.findByRole('heading', { name: 'Serveur MCP' })
}

describe('the MCP key list', () => {
  it('shows every key by name, prefix and scope, never the raw key', async () => {
    render(<App />)
    await goToMcp()

    const rows = within(await screen.findByRole('table'))
    expect(rows.getByText('CI pipeline')).toBeDefined()
    expect(rows.getByText('viewer')).toBeDefined()
    expect(rows.queryByText(/cogenta_sk_mock/u)).toBeNull()
  })

  it('tells a non-admin plainly instead of rendering controls that would be refused', async () => {
    signedInAs(['editor'])
    window.history.pushState(null, '', '/mcp')
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Réservé au rôle « admin » : cette page crée et révoque des identifiants MCP.',
    )
    expect(screen.queryByRole('button', { name: 'Nouvelle clé MCP' })).toBeNull()
  })
})

describe('creating an MCP key', () => {
  it('creates it and shows the raw key plus a ready-to-paste client configuration, exactly once', async () => {
    render(<App />)
    await goToMcp()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle clé MCP' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer une clé MCP' })

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Claude Desktop' } })
    fireEvent.change(screen.getByLabelText('Portée'), { target: { value: 'editor' } })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    const rawKey = await screen.findByText(/^cogenta_sk_mock/u)
    expect(rawKey).toBeDefined()

    // The CLI snippet and the JSON client config both actually carry the raw
    // key — a placeholder here would be a config nobody could paste and use.
    const key = rawKey.textContent ?? ''
    expect(screen.getByText(new RegExp(`cogenta mcp --api-key ${key}$`, 'u'))).toBeDefined()
    expect(screen.getByText(new RegExp(`"${key}"`, 'u'))).toBeDefined()

    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Claude Desktop')).toBeDefined()
    })
  })

  it('copies the CLI snippet to the clipboard', async () => {
    render(<App />)
    await goToMcp()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle clé MCP' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer une clé MCP' })
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Claude Desktop' } })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    await screen.findByText(/^cogenta_sk_mock/u)
    const copyButtons = screen.getAllByRole('button', { name: 'Copier' })
    fireEvent.click(copyButtons[0] as HTMLElement)

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('cogenta mcp --api-key cogenta_sk_mock'),
      )
    })
    expect(await screen.findByText('Copié')).toBeDefined()
  })

  it('hides the key again once it has been noted', async () => {
    render(<App />)
    await goToMcp()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle clé MCP' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer une clé MCP' })
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Claude Desktop' } })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)
    const rawKey = (await screen.findByText(/^cogenta_sk_mock/u)).textContent

    fireEvent.click(screen.getByRole('button', { name: 'Masquer la clé' }))

    await waitFor(() => {
      expect(screen.queryByText(rawKey ?? '')).toBeNull()
    })
  })
})

describe('creating a Chat API key (L22 task 2)', () => {
  it('forces admin scope, and shows the chat endpoint and curl example for the picked agent', async () => {
    render(<App />)
    await goToMcp()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle clé MCP' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer une clé MCP' })

    fireEvent.change(within(dialog).getByLabelText('Usage'), { target: { value: 'chat' } })
    // The free-text "Portée" field disappears — a chat key is always admin-scoped.
    expect(within(dialog).queryByLabelText('Portée')).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Nom'), {
      target: { value: 'Chat integration' },
    })
    fireEvent.change(within(dialog).getByLabelText('Agent'), { target: { value: 'security' } })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    const rawKey = (await screen.findByText(/^cogenta_sk_mock/u)).textContent ?? ''
    expect(screen.getByText(/\/api\/agents\/security\/run$/u)).toBeDefined()
    expect(screen.getByText(new RegExp(`Authorization: Bearer ${rawKey}`, 'u'))).toBeDefined()
    expect(screen.getByText(/One turn per call/u)).toBeDefined()

    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Chat integration')).toBeDefined()
      expect(within(screen.getByRole('table')).getByText('admin')).toBeDefined()
    })
  })
})

describe('revoking an MCP key', () => {
  it('marks it revoked after confirmation, through the design system modal rather than confirm()', async () => {
    render(<App />)
    await goToMcp()
    await screen.findByText('CI pipeline')

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer CI pipeline' }))
    const dialog = await screen.findByRole('dialog', { name: 'Révoquer CI pipeline ?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer la clé' }))

    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Révoquée')).toBeDefined()
    })
  })
})

describe('the MCP screen, for accessibility', () => {
  it('has no serious accessibility violation', async () => {
    const { container } = render(<App />)
    await goToMcp()
    await screen.findByText('CI pipeline')

    await expectNoSeriousA11yViolations(container)
  })
})
