import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { expectNoSeriousA11yViolations } from './helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * Fiche 16 task 4 (submissions screen) and task 7 (GDPR search/erase).
 */

const CONTACT_FORM = {
  id: 'form-1',
  name: 'contact',
  label: 'Contact us',
  fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
  active: true,
  confirmationMessage: 'Thanks!',
  redirectTo: null,
  notifyEmails: [],
  autoresponder: { enabled: false },
  retainDays: 180,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
}

const SUBMISSION_ONE = {
  id: 'sub-1',
  formId: 'form-1',
  formName: 'Contact us',
  values: { email: 'visitor@example.com' },
  consents: [],
  status: 'new' as const,
  ipHash: 'abc123',
  referrer: null,
  userAgent: null,
  submittedAt: '2026-03-01T10:00:00.000Z',
}

const SUBMISSION_TWO = {
  id: 'sub-2',
  formId: 'form-1',
  formName: 'Contact us',
  values: { email: 'other@example.com' },
  consents: [],
  status: 'new' as const,
  ipHash: 'def456',
  referrer: null,
  userAgent: null,
  submittedAt: '2026-03-01T11:00:00.000Z',
}

function signedIn(
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

async function goToSubmissions(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  // The link's accessible name can carry an unread-count badge
  // ("Soumissions 2 non lues") — a regex is what the badge test itself
  // already needs, for the same reason.
  fireEvent.click(await screen.findByRole('link', { name: /^Soumissions/ }))
  await screen.findByRole('heading', { name: 'Soumissions' })
}

describe('the form submissions screen', () => {
  it('lists submissions across forms', async () => {
    signedIn(['admin'], {
      forms: [CONTACT_FORM],
      formSubmissions: [SUBMISSION_ONE, SUBMISSION_TWO],
    })
    render(<App />)
    await goToSubmissions()

    const table = await screen.findByRole('table')
    expect(within(table).getAllByText('Contact us')).toHaveLength(2)
  })

  it('shows an unread-count badge in the sidebar', async () => {
    signedIn(['admin'], {
      forms: [CONTACT_FORM],
      formSubmissions: [SUBMISSION_ONE, SUBMISSION_TWO],
    })
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    const link = await screen.findByRole('link', { name: /Soumissions/ })
    expect(link.textContent).toContain('2')
  })

  it('is not offered to a non-admin', async () => {
    signedIn(['editor'])
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    expect(screen.queryByRole('link', { name: 'Soumissions' })).toBeNull()
  })

  it('expands a submission to show its values', async () => {
    signedIn(['admin'], { forms: [CONTACT_FORM], formSubmissions: [SUBMISSION_ONE] })
    render(<App />)
    await goToSubmissions()
    await screen.findAllByText('Contact us')

    fireEvent.click(screen.getByRole('button', { name: 'Voir' }))
    expect(await screen.findByText('visitor@example.com')).toBeDefined()
  })

  it('marks a submission read through the real API', async () => {
    signedIn(['admin'], { forms: [CONTACT_FORM], formSubmissions: [SUBMISSION_ONE] })
    render(<App />)
    await goToSubmissions()
    await screen.findAllByText('Contact us')

    fireEvent.click(screen.getByRole('button', { name: 'Marquer comme lue' }))

    await waitFor(async () => {
      const response = await fetch('/api/forms/submissions/sub-1', {
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      })
      const body = (await response.json()) as { data: { status: string } }
      expect(body.data.status).toBe('read')
    })
  })

  it('applies a bulk action to several selected submissions', async () => {
    signedIn(['admin'], {
      forms: [CONTACT_FORM],
      formSubmissions: [SUBMISSION_ONE, SUBMISSION_TWO],
    })
    render(<App />)
    await goToSubmissions()
    await screen.findAllByText('Contact us')

    const checkboxes = screen.getAllByRole('checkbox')
    for (const checkbox of checkboxes) fireEvent.click(checkbox)

    const toolbar = screen.getByRole('toolbar')
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Indésirable' }))

    await waitFor(async () => {
      const response = await fetch('/api/forms/submissions', {
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      })
      const body = (await response.json()) as { data: { status: string }[] }
      expect(body.data.every((s) => s.status === 'spam')).toBe(true)
    })
  })

  it('finds a submission by e-mail through the GDPR search, and erases it on request', async () => {
    signedIn(['admin'], {
      forms: [CONTACT_FORM],
      formSubmissions: [SUBMISSION_ONE, SUBMISSION_TWO],
    })
    render(<App />)
    await goToSubmissions()
    await screen.findAllByText('Contact us')

    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'visitor@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    const gdprSection = screen.getByRole('region', { name: 'Demande relative à une personne' })
    await within(gdprSection).findByText(/Contact us/)

    fireEvent.click(within(gdprSection).getByRole('button', { name: 'Tout effacer' }))

    await waitFor(async () => {
      const response = await fetch('/api/forms/submissions', {
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      })
      const body = (await response.json()) as { data: { id: string }[] }
      expect(body.data.map((s) => s.id)).not.toContain('sub-1')
      expect(body.data.map((s) => s.id)).toContain('sub-2')
    })
  })

  it('exports the currently loaded submissions as CSV', async () => {
    const clickSpy = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') el.click = clickSpy
      return el
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    signedIn(['admin'], { forms: [CONTACT_FORM], formSubmissions: [SUBMISSION_ONE] })
    render(<App />)
    await goToSubmissions()
    await screen.findAllByText('Contact us')

    fireEvent.click(screen.getByRole('button', { name: 'Exporter en CSV' }))
    expect(clickSpy).toHaveBeenCalled()
  })

  it('has no serious accessibility violations', async () => {
    signedIn(['admin'], { forms: [CONTACT_FORM], formSubmissions: [SUBMISSION_ONE] })
    const { container } = render(<App />)
    await goToSubmissions()
    await screen.findAllByText('Contact us')
    await expectNoSeriousA11yViolations(container)
  })
})
