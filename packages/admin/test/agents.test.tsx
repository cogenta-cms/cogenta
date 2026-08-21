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
    expect(screen.getByText('propose')).toBeDefined()
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

  it('degrades to the empty state instead of showing the raw 404 wire text, when no registry is mounted', async () => {
    // L20 audit §1 point 5: no `AgentRegistry` is ever constructed unless a
    // caller opts in, so `GET /api/agents` genuinely 404s through the
    // generic content-router fallback on a real `cogenta serve` — this must
    // read as the already-honest banner above, never as a second, scarier
    // "No route matches this path." error underneath it.
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'], agentsRegistryMounted: false })

    render(<App />)
    await goToAgents()

    expect(await screen.findByText('Aucun agent configuré.')).toBeDefined()
    expect(screen.queryByText(/No route matches this path/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
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

    // Autonomy per-tool override: `deps.scan` appears both as a table cell
    // here and as a permission checklist label below.
    expect(screen.getAllByText('deps.scan').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('autonomous')).toBeDefined()

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

    // Skills, memory scope, and a scheduled trigger's cron expression.
    expect(screen.getByText('cve-triage')).toBeDefined()
    expect(screen.getByText(/Portée\s*:\s*site/)).toBeDefined()
    expect(screen.getByText(/0 6 \* \* \*/)).toBeDefined()

    // No subagents declared for this fixture — the empty state renders.
    expect(screen.getByText('Aucun sous-agent déclaré.')).toBeDefined()
  })
})
