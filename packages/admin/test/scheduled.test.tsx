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
  fireEvent.click(screen.getByRole('link', { name: 'Tâches planifiées' }))
  await screen.findByRole('heading', { name: 'Tâches planifiées' })
}

describe('scheduled tasks', () => {
  it('renders nothing for a role below admin (R4: the server-side gate, not the nav link, is the control)', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    // The "Exploitation" nav group is hidden for a role with no visible item
    // in it (fiche 35): there is no link to click, so go straight to the
    // route, the same way a bookmarked URL would — the route itself is what
    // R4 says must still refuse.
    window.history.pushState(null, '', '/scheduled')

    render(<App />)
    // Wait for the shell itself (never a heading — the route renders nothing
    // at all for this role) before asserting the absence.
    await screen.findByRole('navigation', { name: 'Navigation principale' })

    expect(screen.queryByRole('heading', { name: 'Tâches planifiées' })).toBeNull()
  })

  it('lists every registered task with last run, result, and next run, for an admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToScheduled()

    expect(await screen.findByText('Scheduled publication')).toBeDefined()
    expect(screen.getByText('Trash purge')).toBeDefined()
    expect(screen.getByText('Réussie')).toBeDefined()
    expect(screen.getByText('En retard')).toBeDefined()
    expect(screen.getByText('Jamais exécutée')).toBeDefined()
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

    const buttons = screen.getAllByRole('button', { name: 'Exécuter maintenant' })
    fireEvent.click(buttons[0] as HTMLElement)

    expect(await screen.findByText('2 published')).toBeDefined()
  })

  it('asks for confirmation before running a destructive task', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToScheduled()
    await screen.findByText('Trash purge')

    const buttons = screen.getAllByRole('button', { name: 'Exécuter maintenant' })
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

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    await screen.findByText(/job-29/)
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
    expect(screen.getByRole('button', { name: 'Relancer' })).toBeDefined()
  })
})
