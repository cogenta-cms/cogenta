import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToAgents(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Agents' }))
  await screen.findByRole('heading', { name: 'Agents' })
}

describe('agents', () => {
  it('refuses to show anything to a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    // The whole "IA" nav group is hidden for a role that sees no item in it
    // (fiche 35), so there is no link to click — go straight to the route,
    // the same way an editor who once had this URL bookmarked would.
    window.history.pushState(null, '', '/agents')

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('lists agents with state, autonomy and budget, for an admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAgents()

    expect(await screen.findByText('security')).toBeDefined()
    expect(screen.getByText('Activé')).toBeDefined()
    // "propose" (contract C) reads as "Co-pilote", the L22 task 1 UI label.
    expect(screen.getByText('Co-pilote')).toBeDefined()
  })

  it('disables an agent from the list', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAgents()
    await screen.findByText('security')

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }))

    expect(await screen.findByText('Désactivé')).toBeDefined()
  })

  it('shows traces and history for the selected agent', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAgents()
    await screen.findByText('security')

    fireEvent.click(screen.getByRole('button', { name: 'security' }))

    expect(await screen.findByText(/end_turn/)).toBeDefined()
    // `deps.scan` now also appears in the L21 task 4 permission checklist and
    // the autonomy overrides table, so this asserts on the history entry's
    // own action text specifically rather than the ambiguous bare name.
    expect(await screen.findByText('2026-03-01T00:00:00.000Z — deps.scan')).toBeDefined()
  })

  // L21 task 4: the detail panel now shows everything `AgentDeclaration`
  // (contract C) already models but the old screen hid — permissions,
  // autonomy overrides, per-metric budget, skills, subagents, model,
  // memory and triggers — all read-only.
  it('shows the full declared configuration for the selected agent', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAgents()
    await screen.findByText('security')

    fireEvent.click(screen.getByRole('button', { name: 'security' }))

    // Model preference.
    expect(await screen.findByText(/claude-sonnet/)).toBeDefined()
    expect(screen.getByText(/local/)).toBeDefined()

    // Autonomy default, shown as the UI's three-level label (L22 task 1
    // item 4): "propose" (contract C) reads as "Co-pilote" — once in the
    // list row, once in the detail panel below it.
    expect(screen.getAllByText(/Co-pilote/).length).toBeGreaterThanOrEqual(1)

    // Budget: all three metrics, not just tokens/day.
    expect(screen.getByText('10')).toBeDefined()
    expect(screen.getByText('30')).toBeDefined()

    // Permissions: the granted tool is checked, an undeclared one is not.
    const grantedCheckbox = screen.getByLabelText('deps.scan') as HTMLInputElement
    expect(grantedCheckbox.checked).toBe(true)
    expect(grantedCheckbox.disabled).toBe(true)
    const ungrantedCheckbox = screen.getByLabelText('content.publish') as HTMLInputElement
    expect(ungrantedCheckbox.checked).toBe(false)
    expect(ungrantedCheckbox.disabled).toBe(true)

    // Skills.
    expect(screen.getByText('cve-triage')).toBeDefined()

    // No subagents declared for this fixture — the empty state renders.
    expect(screen.getByText('Aucun sous-agent déclaré.')).toBeDefined()
  })

  it('creates a new agent and runs it, showing the result', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAgents()

    fireEvent.click(screen.getByRole('button', { name: 'Créer un agent' }))
    fireEvent.change(screen.getByPlaceholderText('ex. Rédacteur de newsletter'), {
      target: { value: 'Helper' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Helper' }))
    fireEvent.change(await screen.findByPlaceholderText('Que doit faire cet agent ?'), {
      target: { value: 'summarise recent posts' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }))

    expect(await screen.findByText(/Mock result for: summarise recent posts/)).toBeDefined()
  })
})
