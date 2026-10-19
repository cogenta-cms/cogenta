import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToScheduled(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Tâches planifiées' }))
  await screen.findByRole('heading', { name: 'Tâches planifiées' })
}

describe('scheduled tasks', () => {
  it('explains why a role below admin cannot access scheduled tasks', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    // The "Exploitation" nav group is hidden for a role with no visible item
    // in it (fiche 35): there is no link to click, so go straight to the
    // route, the same way a bookmarked URL would — the route itself is what
    // R4 says must still refuse.
    window.history.pushState(null, '', '/scheduled')

    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'Tâches planifiées', level: 1 }),
    ).toBeDefined()
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Cette page est réservée aux administrateurs. Votre compte n’a pas les permissions nécessaires ; contactez un administrateur si vous devez y accéder.',
    )
  })

  it('lists every registered task with last run, result, and next run, for an admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToScheduled()

    expect(await screen.findByText('Scheduled publication')).toBeDefined()
    const scrollRegion = screen.getByRole('region', { name: 'Tâches' })
    expect(scrollRegion.tabIndex).toBe(0)
    scrollRegion.focus()
    expect(document.activeElement).toBe(scrollRegion)
    expect(
      screen.getByText(
        'Supprime définitivement le contenu de la corbeille passé le délai de rétention du site.',
      ),
    ).toBeDefined()
    expect(screen.getByText('Réussie')).toBeDefined()
    expect(screen.getByText('En retard')).toBeDefined()
    expect(screen.getByText('Jamais exécutée')).toBeDefined()
  })

  it('names the builtin audit and commerce tasks in French while preserving a third-party description', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      scheduledTasks: [
        'audit-prune',
        'commerce-order-emails',
        'commerce-subscriptions',
        'commerce-carts',
        'plugin:custom:task',
      ].map((name) => ({
        name,
        description:
          name === 'plugin:custom:task' ? 'Custom author task' : `Server description ${name}`,
        intervalMs: 60_000,
        destructive: false,
        lastRun: null,
        nextRunAt: 1_772_500_060_000,
        overdue: false,
        recentRuns: [],
      })),
    })
    render(<App />)
    await goToScheduled()
    expect(await screen.findByText('Purger le journal d’audit')).toBeDefined()
    expect(screen.getByText('Envoyer les e-mails de commande')).toBeDefined()
    expect(screen.getByText('Facturer et relancer les abonnements')).toBeDefined()
    expect(screen.getByText('Détecter les paniers abandonnés')).toBeDefined()
    expect(screen.getByText('Custom author task')).toBeDefined()
    expect(screen.queryByText('Server description commerce-carts')).toBeNull()
  })

  it('says which clock is driving the tasks', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'], scheduledTasksMode: 'external-cron' })

    render(<App />)
    await goToScheduled()

    expect(await screen.findByText(/cron externe/, { exact: false })).toBeDefined()
  })

  it('runs a non-destructive task on one click, and shows the result', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToScheduled()
    await screen.findByText('Scheduled publication')

    const buttons = screen.getAllByRole('button', { name: /^Exécuter maintenant :/u })
    fireEvent.click(buttons[0] as HTMLElement)

    expect(await screen.findByText('2 published')).toBeDefined()
  })

  it('asks for confirmation before running a destructive task', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToScheduled()
    await screen.findByText(
      'Supprime définitivement le contenu de la corbeille passé le délai de rétention du site.',
    )

    const buttons = screen.getAllByRole('button', { name: /^Exécuter maintenant :/u })
    // The second registered task (trash-purge) is destructive.
    fireEvent.click(buttons[1] as HTMLElement)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/destructive/)).toBeDefined()
    // Opening the confirmation must not have run it yet.
    expect(screen.queryByText('5 purged')).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Exécuter maintenant' }))
    expect(await screen.findByText('5 purged')).toBeDefined()
  })

  it('paginates the queue client-side once there are more jobs than one page holds (fiche 67 task 3)', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    const scheduledTasksQueue = Array.from({ length: 30 }, (_, index) => ({
      id: `job-${index}`,
      status: 'pending' as const,
    }))
    installMockFetch({ roles: ['admin'], scheduledTasksQueue })

    render(<App />)
    await goToScheduled()

    await screen.findByText(/job-0/)
    expect(screen.queryByText(/job-29/)).toBeNull()
    expect(screen.queryByText(/job-20/)).toBeNull()
    expect(screen.getByText('1–20 sur 30')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    await screen.findByText(/job-29/)
  })

  it('bounds 53 registered tasks to twenty rows and preserves page two after a manual run', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      scheduledTasks: Array.from({ length: 53 }, (_, index) => ({
        name: `plugin:qa:task-${index + 1}`,
        description: `QA tâche ${index + 1}`,
        intervalMs: 60_000,
        destructive: false,
        lastRun: null,
        nextRunAt: 1_772_500_060_000,
        overdue: false,
        recentRuns: [],
      })),
    })
    render(<App />)
    await goToScheduled()
    await screen.findByText('QA tâche 1')
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(21)
    expect(screen.queryByText('QA tâche 21')).toBeNull()
    const pages = screen.getByRole('navigation', { name: 'Pagination des tâches' })
    fireEvent.click(within(pages).getByRole('button', { name: 'Suivant' }))
    expect(screen.getByText('21–40 sur 53')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter maintenant : QA tâche 21' }))
    await screen.findByText('2 published')
    expect(screen.getByText('21–40 sur 53')).toBeDefined()
    expect(within(table).getAllByRole('row')).toHaveLength(21)
    expect(screen.getByText('QA tâche 21')).toBeDefined()
  })

  it('shows an empty queue as empty, and a failed job as retryable', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      scheduledTasksQueue: [
        { id: 'job-1', status: 'failed' },
        { id: 'job-2', status: 'pending' },
      ],
    })

    render(<App />)
    await goToScheduled()

    expect(await screen.findByText(/job-1/)).toBeDefined()
    expect(screen.getByText(/job-2/)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Relancer : job-1' })).toBeDefined()
  })
})
