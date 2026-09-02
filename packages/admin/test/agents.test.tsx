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

    // Fiche 71: the detail panel is now a real route (`agents/:name`), reached
    // through a `<Link>`, not a button that swaps state in place.
    fireEvent.click(screen.getByRole('link', { name: 'security' }))

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

    // Fiche 71: the detail panel is now a real route (`agents/:name`), reached
    // through a `<Link>`, not a button that swaps state in place.
    fireEvent.click(screen.getByRole('link', { name: 'security' }))

    // The page itself now opens straight on the chat (fiche feedback); the
    // full configuration this test checks lives behind "Réglages".
    fireEvent.click(await screen.findByRole('button', { name: "Réglages de l'agent" }))

    // Model preference.
    expect(await screen.findByText(/claude-sonnet/)).toBeDefined()
    expect(screen.getByText(/local/)).toBeDefined()

    // Autonomy default, shown as the UI's three-level label (L22 task 1
    // item 4): "propose" (contract C) reads as "Co-pilote".
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
    installMockFetch({
      roles: ['admin'],
      providers: [
        {
          provider: 'anthropic',
          enabled: true,
          model: 'claude-sonnet-5',
          maskedKey: '••••abcd',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
    })

    render(<App />)
    await goToAgents()

    fireEvent.click(screen.getByRole('button', { name: 'Créer un agent' }))
    fireEvent.change(screen.getByPlaceholderText('ex. Rédacteur de newsletter'), {
      target: { value: 'Helper' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    // Fiche 71: the row's name is a real `<Link>` into `agents/:name`.
    fireEvent.click(await screen.findByRole('link', { name: 'Helper' }))
    // The detail page's own chat feed (fiche: restructured from a single
    // "Exécuter maintenant" instruction box into a real conversation).
    fireEvent.change(await screen.findByLabelText('Message'), {
      target: { value: 'summarise recent posts' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText('summarise recent posts')).toBeDefined()
    expect(await screen.findByText('Mock reply to: summarise recent posts')).toBeDefined()
  })

  // Fiche 55 task 3: creating still requires just a name and a provider —
  // the rest (role, objectives, style, system prompt, tools, autonomy) is
  // now collectible in the same form, but never required.
  it('the create form disables Save until a name and an enabled provider are both present', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] }) // no providers configured

    render(<App />)
    await goToAgents()

    fireEvent.click(screen.getByRole('button', { name: 'Créer un agent' }))
    expect(await screen.findByText(/Aucun fournisseur n'est encore activé/)).toBeDefined()
    fireEvent.change(screen.getByPlaceholderText('ex. Rédacteur de newsletter'), {
      target: { value: 'Helper' },
    })

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveProperty('disabled', true)
  })

  // Fiche 55 task 1/3: creation grows into role/objectives/style/system
  // prompt, either hand-written or generated (R6: reviewed, never applied
  // automatically) — and the generated draft appears in the same fields the
  // human can still edit before Save.
  it('generates a draft identity from a brief, reviewed before saving, never applied automatically', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      providers: [
        {
          provider: 'anthropic',
          enabled: true,
          model: 'claude-sonnet-5',
          maskedKey: '••••abcd',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      assistantRun: {
        'assist.generate_agent_identity': {
          role: 'an agent that drafts newsletter summaries',
          objectives: ['Summarise the week’s published posts.', 'Never invent a fact.'],
          style: 'Warm and concise.',
          systemPrompt: 'Always cite the source post for every claim.',
          applied: false,
        },
      },
    })

    render(<App />)
    await goToAgents()

    fireEvent.click(screen.getByRole('button', { name: 'Créer un agent' }))
    fireEvent.change(screen.getByPlaceholderText('ex. Rédacteur de newsletter'), {
      target: { value: 'Newsletter Drafter' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Surveiller les nouvelles commandes/), {
      target: { value: 'Résume les articles publiés cette semaine pour une newsletter.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    expect(
      await screen.findByDisplayValue('an agent that drafts newsletter summaries'),
    ).toBeDefined()
    expect(screen.getByDisplayValue('Warm and concise.')).toBeDefined()
    expect(screen.getByDisplayValue('Always cite the source post for every claim.')).toBeDefined()

    // Nothing is created until Save is clicked explicitly (R6).
    expect(screen.queryByRole('link', { name: 'Newsletter Drafter' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('link', { name: 'Newsletter Drafter' })).toBeDefined()
  })
})

describe('agent detail — a real route with its own URL (fiche 71)', () => {
  it('navigates to /agents/<name> when opening an agent from the list', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToAgents()
    await screen.findByText('security')

    fireEvent.click(screen.getByRole('link', { name: 'security' }))

    expect(await screen.findByRole('heading', { name: /security/, level: 1 })).toBeDefined()
    expect(window.location.pathname).toBe('/agents/security')
  })

  it('shows the agent detail straight away when mounted directly on /agents/<name>', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })
    window.history.pushState(null, '', '/agents/security')

    render(<App />)

    expect(await screen.findByRole('heading', { name: /security/, level: 1 })).toBeDefined()
    expect(await screen.findByText(/end_turn/)).toBeDefined()
  })

  it('has a real "Retour" link back to the list, never history.back()', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })
    window.history.pushState(null, '', '/agents/security')

    render(<App />)
    await screen.findByRole('heading', { name: /security/, level: 1 })

    const back = screen.getByRole('link', { name: /Retour/ })
    expect(back.getAttribute('href')).toBe('/agents')
  })

  it('shows a clear message, not a blank screen, for an agent name that no longer exists', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })
    window.history.pushState(null, '', '/agents/does-not-exist')

    render(<App />)

    expect(await screen.findByText("Cet agent n'existe pas ou plus.")).toBeDefined()
    expect(screen.getByRole('link', { name: /Retour/ })).toBeDefined()
  })

  it('refuses to show anything to a role below admin, on the detail route directly', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    window.history.pushState(null, '', '/agents/security')

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
  })
})
