import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

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
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * A customer's own fiche (fiche 52 task 3) — 221 lines of RGPD
 * export/anonymisation that shipped with zero admin test (audit §4 P1:
 * "une action irréversible sans test est un vrai risque"). This suite is
 * the first thing that ever exercises `CommerceCustomerRoute` end to end.
 */
async function goToCustomerDetail(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Clients' }))
  await screen.findByRole('heading', { name: 'Clients' })
  // The seeded customer has a name ('Shopper One'), so the list link and the
  // detail heading both show that — the e-mail is a separate line below it
  // on the detail screen, per `customer.name ?? customer.email`.
  fireEvent.click(await screen.findByRole('link', { name: 'Shopper One' }))
  await screen.findByRole('heading', { name: 'Shopper One' })
}

describe('customer detail — GDPR export and anonymisation (audit A1 P1)', () => {
  it('shows the customer record aggregated server-side, not re-derived here', async () => {
    render(<App />)
    await goToCustomerDetail()

    expect(screen.getByText('Total dépensé', { exact: false })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Commandes' })).toBeDefined()
  })

  it('exports the customer record as a downloadable JSON file', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-export')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    render(<App />)
    await goToCustomerDetail()

    fireEvent.click(screen.getByRole('button', { name: 'Exporter (RGPD)' }))

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1)
    })

    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })

  it('anonymises the customer only after a real confirmation, then shows the anonymised record', async () => {
    render(<App />)
    await goToCustomerDetail()

    // Erasure is irreversible: the button only opens a confirmation.
    fireEvent.click(screen.getByRole('button', { name: 'Anonymiser' }))
    const dialog = await screen.findByRole('dialog', { name: /^Anonymiser ce client/u })
    expect(screen.queryByText('La fiche de ce client a été anonymisée.')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonymiser' }))

    await screen.findByText('La fiche de ce client a été anonymisée.')
    // The erased e-mail is no longer shown anywhere: the record reads
    // "Client anonymisé", and there is nothing left to anonymise again.
    expect(await screen.findByRole('heading', { name: 'Client anonymisé' })).toBeDefined()
    expect(screen.queryByText(/anon-customer-1@deleted\.invalid/u)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Anonymiser' })).toBeNull()
  })

  it('does nothing when the irreversible confirmation is declined', async () => {
    render(<App />)
    await goToCustomerDetail()

    fireEvent.click(screen.getByRole('button', { name: 'Anonymiser' }))
    const dialog = await screen.findByRole('dialog', { name: /^Anonymiser ce client/u })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /^Anonymiser ce client/u })).toBeNull()
    })
    expect(screen.queryByText('La fiche de ce client a été anonymisée.')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Client anonymisé' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Shopper One' })).toBeDefined()
  })

  it('offers no export or anonymise action to a role without commerce write (courtesy gate, R4 enforced server-side)', async () => {
    signedInAs(['viewer'])
    // The "Boutique" nav group only shows for admin or once the shop has
    // sold something — go straight to the route, the same way a bookmarked
    // URL would, matching the pattern already used for the subscription and
    // order detail permission tests.
    window.history.pushState(null, '', '/commerce/customers/customer-1')
    render(<App />)

    await screen.findByRole('heading', { name: 'Shopper One' })
    expect(screen.queryByRole('button', { name: 'Exporter (RGPD)' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Anonymiser' })).toBeNull()
  })
})
