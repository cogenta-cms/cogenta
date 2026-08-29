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

function table(): HTMLElement {
  return screen.getByRole('table')
}

describe('coupons', () => {
  it('creates a percentage coupon and lists it', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Coupons' }))
    await screen.findByRole('heading', { name: 'Coupons' })

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau coupon' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer un coupon' })

    fireEvent.change(within(dialog).getByLabelText('Code'), { target: { value: 'spring25' } })
    fireEvent.change(within(dialog).getByLabelText('Pourcentage de remise'), {
      target: { value: '25' },
    })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    await waitFor(() => {
      expect(within(table()).getByText('SPRING25')).toBeDefined()
    })
    expect(within(table()).getByText('25%')).toBeDefined()
  })

  it('deactivates a coupon', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Coupons' }))
    await screen.findByRole('heading', { name: 'Coupons' })

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau coupon' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer un coupon' })
    fireEvent.change(within(dialog).getByLabelText('Code'), { target: { value: 'onetime' } })
    fireEvent.change(within(dialog).getByLabelText(/type/iu), {
      target: { value: 'free_shipping' },
    })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)
    await screen.findByText('ONETIME')

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver ONETIME' }))
    await waitFor(() => {
      expect(within(table()).getByText('Désactivé')).toBeDefined()
    })
  })
})

describe('subscriptions', () => {
  it('lists the seeded subscription and cancels it', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Abonnements' }))
    await screen.findByRole('heading', { name: 'Abonnements' })

    expect(within(table()).getByText('customer-1')).toBeDefined()
    expect(within(table()).getByText('Actif')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await waitFor(() => {
      expect(within(table()).getByText('Annulé')).toBeDefined()
    })
  })

  it('refuses to cancel without commerce.order.write', async () => {
    signedInAs(['viewer'])
    // The "Boutique" nav group only shows for an admin or once the shop has
    // sold something (fiche 35); a plain viewer on a fresh fixture sees no
    // link, so go straight to the route, the same way a bookmarked URL
    // would.
    window.history.pushState(null, '', '/commerce/subscriptions')
    render(<App />)
    await screen.findByRole('heading', { name: 'Abonnements' })

    // Unlike the previous test, nothing here first reads the table's own
    // content before clicking — so this must wait for the async list fetch
    // to resolve and the "Annuler" button to actually mount, rather than a
    // bare `getByRole` racing the still-`loading` screen (a real, pre-existing
    // flake, not something a synchronous query papers over).
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }))
    expect(await screen.findByText(/allowed to do that/u)).toBeDefined()
  })
})

describe('subscription detail — a real route with its own URL (fiche 71)', () => {
  it('navigates to /commerce/subscriptions/<id> when opening "Détails"', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Abonnements' }))
    await screen.findByRole('heading', { name: 'Abonnements' })

    fireEvent.click(screen.getByRole('link', { name: 'Détails' }))

    expect(await screen.findByText('Historique de facturation')).toBeDefined()
    expect(window.location.pathname).toBe('/commerce/subscriptions/subscription-1')
  })

  it('shows the subscription detail straight away when mounted directly on the URL', async () => {
    window.history.pushState(null, '', '/commerce/subscriptions/subscription-1')
    render(<App />)

    expect(await screen.findByText(/customer-1/)).toBeDefined()
    expect(screen.getByText('Historique de facturation')).toBeDefined()
  })

  it('has a real "Retour" link back to the list, never history.back()', async () => {
    window.history.pushState(null, '', '/commerce/subscriptions/subscription-1')
    render(<App />)
    await screen.findByText('Historique de facturation')

    const back = screen.getByRole('link', { name: /Retour/ })
    expect(back.getAttribute('href')).toBe('/commerce/subscriptions')
  })

  it('shows a clear message, not a blank screen, for a subscription id that no longer exists', async () => {
    window.history.pushState(null, '', '/commerce/subscriptions/does-not-exist')
    render(<App />)

    expect(await screen.findByText("Cet abonnement n'existe pas.")).toBeDefined()
    expect(screen.getByRole('link', { name: /Retour/ })).toBeDefined()
  })

  it('pauses a subscription from its own detail screen', async () => {
    window.history.pushState(null, '', '/commerce/subscriptions/subscription-1')
    render(<App />)
    await screen.findByText('Historique de facturation')

    fireEvent.click(screen.getByRole('button', { name: 'Suspendre' }))

    expect(await screen.findByText(/En pause/)).toBeDefined()
    // The action buttons follow the new status: "Suspendre" is gone, "Reprendre" is offered instead.
    expect(screen.queryByRole('button', { name: 'Suspendre' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reprendre' })).toBeDefined()
  })

  it('refuses to show anything to a signed-out actor, on the detail route directly', async () => {
    signedInAs([])
    window.history.pushState(null, '', '/commerce/subscriptions/subscription-1')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.queryByText('Historique de facturation')).toBeNull()
  })
})
