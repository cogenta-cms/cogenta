import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { expectNoSeriousA11yViolations } from './helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * "Exploitation" > Observabilité (fiche L22 task 5) — the two settings
 * (`observability.enabled`/`observability.logLevel`) through the same
 * generic registry `commerce-settings.test.tsx` already exercises for a
 * group with its own screen, plus the read-only recent traces/logs table.
 */

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

function signedInAs(
  roles: readonly string[],
  extra: Parameters<typeof installMockFetch>[0] = {},
): void {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles, ...extra })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToObservability(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Observabilité' }))
  await screen.findByRole('heading', { name: 'Observabilité' })
}

describe('the observability screen', () => {
  it('renders the collection settings with their real registry defaults', async () => {
    signedInAs(['admin'])
    render(<App />)
    await goToObservability()

    const enabled = (await screen.findByLabelText(
      'Collecter les traces et journaux localement',
    )) as HTMLInputElement
    expect(enabled.checked).toBe(true)
    const level = screen.getByLabelText('Niveau de journalisation capturé') as HTMLSelectElement
    expect(level.value).toBe('info')
  })

  it('says this is a local fallback view, not a replacement for a real APM', async () => {
    signedInAs(['admin'])
    render(<App />)
    await goToObservability()

    expect(screen.getByText(/pas un remplacement d'un vrai APM/u)).toBeDefined()
  })

  it('saves a setting change and reports it saved', async () => {
    signedInAs(['admin'])
    render(<App />)
    await goToObservability()

    const enabled = await screen.findByLabelText('Collecter les traces et journaux localement')
    fireEvent.click(enabled)

    await screen.findByText('Enregistré.')
    expect((enabled as HTMLInputElement).checked).toBe(false)
  })

  it('renders recent traces, newest entries as given by the server', async () => {
    signedInAs(['admin'], {
      observability: {
        enabled: true,
        traces: [
          {
            id: 't1',
            at: '2026-08-20T10:00:00.000Z',
            traceId: 'trace-1',
            spanId: 'span-1',
            name: 'GET /api/content/posts',
            method: 'GET',
            path: '/api/content/posts',
            statusCode: 200,
            durationMs: 12,
            ok: true,
          },
          {
            id: 't2',
            at: '2026-08-20T10:01:00.000Z',
            traceId: 'trace-2',
            spanId: 'span-2',
            name: 'POST /api/settings',
            method: 'POST',
            path: '/api/settings',
            statusCode: 500,
            durationMs: 7,
            ok: false,
          },
        ],
      },
    })
    render(<App />)
    await goToObservability()

    expect(await screen.findByText('/api/content/posts')).toBeDefined()
    expect(screen.getByText('/api/settings')).toBeDefined()
    expect(screen.getByText('500')).toBeDefined()
  })

  it('renders recent logs', async () => {
    signedInAs(['admin'], {
      observability: {
        logs: [
          {
            id: 'l1',
            at: '2026-08-20T10:00:00.000Z',
            level: 'error',
            msg: 'scheduled task failed',
          },
        ],
      },
    })
    render(<App />)
    await goToObservability()

    expect(await screen.findByText('scheduled task failed')).toBeDefined()
    expect(screen.getByText('error')).toBeDefined()
  })

  it('paginates traces client-side once there are more than one page holds (fiche 67 task 4)', async () => {
    const traces = Array.from({ length: 30 }, (_, index) => ({
      id: `t${index}`,
      at: new Date(2026, 7, 20, 10, index).toISOString(),
      traceId: `trace-${index}`,
      spanId: `span-${index}`,
      name: `GET /api/content/posts/${index}`,
      method: 'GET',
      path: `/path-${index}`,
      statusCode: 200,
      durationMs: 5,
      ok: true,
    }))
    signedInAs(['admin'], { observability: { enabled: true, traces } })
    render(<App />)
    await goToObservability()

    // The whole snapshot came back in one fetch (the ring buffer is already
    // bounded) — the first page shows the first 25 entries, not all 30.
    await screen.findByText('/path-0')
    expect(screen.queryByText('/path-29')).toBeNull()

    // Logs are empty in this fixture, so their pager does not render at all
    // (`Pagination`'s `pageCount <= 1` case) — only the traces "Suivant" exists.
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    await screen.findByText('/path-29')
  })

  it('says nothing is being recorded when collection is off', async () => {
    signedInAs(['admin'], { observability: { enabled: false } })
    render(<App />)
    await goToObservability()

    expect(await screen.findByText(/La collecte est désactivée/u)).toBeDefined()
  })

  it('shows empty-state copy with no traces or logs yet', async () => {
    signedInAs(['admin'])
    render(<App />)
    await goToObservability()

    expect(await screen.findByText("Aucune trace enregistrée pour l'instant.")).toBeDefined()
    expect(screen.getByText("Aucune ligne de journal enregistrée pour l'instant.")).toBeDefined()
  })

  it('refuses a write from a role with no admin permission, at the API', async () => {
    signedInAs(['viewer'])
    render(<App />)

    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ key: 'observability.enabled', value: false }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses the screen to a non-admin', async () => {
    signedInAs(['viewer'])
    window.history.pushState(null, '', '/observability')
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Réservé au rôle « admin ».',
    )
  })

  it('has no serious accessibility violation', async () => {
    signedInAs(['admin'])
    const { container } = render(<App />)
    await goToObservability()
    await screen.findByLabelText('Collecter les traces et journaux localement')

    await expectNoSeriousA11yViolations(container)
  })
})
