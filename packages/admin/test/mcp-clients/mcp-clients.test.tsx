import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * Fiche 58 tasks 2-6 — "MCP Clients", the opposite direction from the
 * pre-existing "MCP Server" screen (`test/mcp/mcp.test.tsx`, renamed by
 * task 1). This screen is the one place a `stdio` connection's mandatory,
 * honest confirmation is actually shown to an operator — the refusal
 * itself lives server-side (`packages/mcp/src/registry/store.ts`,
 * `packages/api/test/rest/mcp-connections-router.test.ts`), this test
 * proves the UI genuinely gates the submit button on it rather than
 * relying on the server alone to catch a forgotten checkbox.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToMcpClients(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Clients MCP' }))
  await screen.findByRole('heading', { name: 'Clients MCP' })
}

describe('MCP Clients', () => {
  it('refuses to show anything to a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    window.history.pushState(null, '', '/mcp-clients')

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
  })

  it('refuses to submit a stdio connection until the unsandboxed-execution warning is explicitly confirmed', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToMcpClients()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle connexion' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'fake' } })
    fireEvent.change(within(dialog).getByLabelText('Commande'), {
      target: { value: '/usr/bin/mcp-fake' },
    })

    const submit = within(dialog).getByRole('button', { name: 'Créer la connexion' })
    expect(submit).toHaveProperty('disabled', true)

    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: /je comprends que ceci exécute un exécutable non sandboxé/i,
      }),
    )
    expect(submit).toHaveProperty('disabled', false)
  })

  it('creates a connection, tests it, exposes a discovered tool, then disables and removes it', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToMcpClients()

    expect(await screen.findByText(/Aucune connexion MCP/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle connexion' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'fake' } })
    fireEvent.change(within(dialog).getByLabelText('Commande'), {
      target: { value: '/usr/bin/mcp-fake' },
    })
    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: /je comprends que ceci exécute un exécutable non sandboxé/i,
      }),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer la connexion' }))

    expect(await screen.findByText('fake')).toBeDefined()
    expect(screen.getByText('Jamais testée')).toBeDefined()

    // "Manage tools" is not offered before a successful test.
    expect(screen.getByRole('button', { name: 'Gérer les outils' })).toHaveProperty(
      'disabled',
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tester la connexion' }))
    await screen.findByText('Joignable')
    expect(screen.getByText('0 exposé(s) / 1 découvert(s)')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Gérer les outils' }))
    const manageDialog = await screen.findByRole('dialog')
    fireEvent.click(within(manageDialog).getByRole('checkbox', { name: /greet/ }))
    fireEvent.click(within(manageDialog).getByRole('button', { name: 'Enregistrer' }))

    await screen.findByText('1 exposé(s) / 1 découvert(s)')

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }))
    expect(await screen.findByText('Désactivée')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(await screen.findByText('Activée')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la connexion' }))

    expect(await screen.findByText(/Aucune connexion MCP/)).toBeDefined()
  })
})
