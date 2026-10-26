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
  // jsdom has no ResizeObserver; the shell measures its top bar with one.
  if (!('ResizeObserver' in globalThis)) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    )
  }
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
  fireEvent.click(await screen.findByRole('link', { name: 'Serveur MCP' }))
  await screen.findByRole('heading', { name: 'Serveur MCP' })
}

describe('the MCP key list', () => {
  it('shows every key by name, prefix and scope, never the raw key', async () => {
    render(<App />)
    await goToMcp()

    const rows = within(await screen.findByRole('table'))
    expect(rows.getByText('CI pipeline')).toBeDefined()
    // Both seeded keys are scoped to "viewer" (fiche 62 added a second,
    // already-revoked key shared with `api-keys.test.tsx`'s purge tests),
    // so this is no longer unique to a single row — scope to the row.
    const ciPipelineRow = screen.getByText('CI pipeline').closest('tr') as HTMLElement
    expect(within(ciPipelineRow).getByText('Lecteur')).toBeDefined()
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
  it('creates it and shows the raw key plus ready-to-paste remote and local configurations', async () => {
    render(<App />)
    await goToMcp()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle clé MCP' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer une clé MCP' })

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Claude Desktop' } })
    // A closed list of the site's roles, never free text.
    expect(within(dialog).getByRole('checkbox', { name: 'Gestionnaire de boutique' })).toBeDefined()
    expect(within(dialog).getByRole('checkbox', { name: 'Éditeur' })).toHaveProperty(
      'checked',
      true,
    )
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    const rawKey = await screen.findByText(/^cogenta_sk_mock/u)
    const key = rawKey.textContent ?? ''

    // Remote: Claude Code over HTTP, with the key as a bearer header.
    expect(
      screen.getByText(
        new RegExp(
          `^claude mcp add --transport http cogenta http://localhost(:\\d+)?/api/mcp --header "Authorization: Bearer ${key}"$`,
          'u',
        ),
      ),
    ).toBeDefined()
    expect(screen.getByText(/"type": "http"/u)).toBeDefined()
    expect(screen.getByText(/"mcp-remote"/u)).toBeDefined()
    // Local: the real command, --cwd in args, the key in env and never in args.
    const local = screen.getByText(/"--cwd",\s+"\/srv\/site"/u)
    expect(local.textContent).toContain(`"COGENTA_MCP_API_KEY": "${key}"`)
    expect(local.textContent).not.toContain('"--api-key"')
    expect(local.textContent).not.toContain('"cwd"')

    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Claude Desktop')).toBeDefined()
    })
  })

  it('refuses to create a key with no role', async () => {
    render(<App />)
    await goToMcp()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle clé MCP' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer une clé MCP' })
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'No role' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Éditeur' }))
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    expect(await within(dialog).findByRole('alert')).toHaveProperty(
      'textContent',
      'Choisissez au moins un rôle.',
    )
  })

  it('explains that every write waits for an approval, and links to where it is given', async () => {
    render(<App />)
    await goToMcp()

    expect(screen.getByText(/attend votre validation dans Agents/u)).toBeDefined()
    expect(screen.getByRole('link', { name: 'Ouvrir les actions à approuver' })).toHaveProperty(
      'pathname',
      '/agents',
    )
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
        expect.stringContaining('claude mcp add --transport http cogenta'),
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
    // The role picker disappears — a chat key is always admin-scoped.
    expect(within(dialog).queryByRole('checkbox', { name: 'Éditeur' })).toBeNull()

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
      expect(within(screen.getByRole('table')).getByText('Administrateur')).toBeDefined()
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

    // A revoked key leaves the default list, and is one tick away.
    await waitFor(() => {
      expect(screen.queryByText('CI pipeline')).toBeNull()
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Afficher les clés révoquées/u }))
    const ciPipelineRow = (await screen.findByText('CI pipeline')).closest('tr') as HTMLElement
    expect(within(ciPipelineRow).getByText('Révoquée')).toBeDefined()
    expect(
      within(ciPipelineRow).getByRole('button', { name: 'Retirer CI pipeline de la liste' }),
    ).toBeDefined()
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
