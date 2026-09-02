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

// Audit T-COM-02: `changeSubscriptionPlan` (`/subscriptions/{id}/change-plan`)
// shipped server-side with fiche 53 task 4 and had no screen ever calling it.
describe('subscription detail — changing plan (audit T-COM-02)', () => {
  const seededVariant = {
    id: 'variant-xl',
    productId: 'product-xl',
    sku: 'PLAN-XL',
    title: 'Édition XL',
    priceMinor: 2500,
    currency: 'EUR',
    onHand: 10,
    allowBackorder: false,
    weightGrams: 0,
    taxCategory: 'standard',
    position: 0,
    lowStockThreshold: null,
    compareAtPriceMinor: null,
    saleStartsAt: null,
    saleEndsAt: null,
    widthMm: null,
    heightMm: null,
    depthMm: null,
    imageMediaId: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  }
  const seededCatalog = {
    commerceProducts: [
      {
        id: 'product-xl',
        handle: 'plan-xl',
        title: 'Grand format',
        status: 'active' as const,
        contentRef: null,
        imageMediaIds: [],
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ],
    commerceVariants: [seededVariant],
  }

  async function pickVariant(): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: 'Changer de formule' }))
    const productSelect = await screen.findByLabelText('Produit')
    // The product list is its own async fetch (`listProducts`, opened by
    // `openChangePlan`) — the select mounts disabled with only the
    // placeholder option until it resolves.
    const productOption = await waitFor(
      () =>
        within(productSelect).getByRole('option', { name: 'Grand format' }) as HTMLOptionElement,
    )
    fireEvent.change(productSelect, { target: { value: productOption.value } })

    const variantSelect = await screen.findByLabelText('Variante')
    const variantOption = await waitFor(() =>
      within(variantSelect).getByRole('option', { name: /Édition XL —/ }),
    )
    fireEvent.change(variantSelect, {
      target: { value: (variantOption as HTMLOptionElement).value },
    })
  }

  it('changes the plan and shows the settled result, only after an explicit confirmation', async () => {
    // Not the shared `signedInAs` helper: it calls `installMockFetch` with no
    // seed data, and this test needs the product/variant seeded above.
    localStorage.clear()
    localStorage.setItem('cogenta.session.token', VALID_TOKEN)
    // The mock's `change-plan` route always settles with no charge due
    // (`prorationMinor: 0`) — this proves the screen's whole round trip
    // (pick a variant of the same currency, confirm, read the server's own
    // result back), not the store's actual proration arithmetic, which
    // `@cogenta/commerce`'s own tests already cover.
    installMockFetch({ roles: ['admin'], ...seededCatalog })
    window.history.pushState(null, '', '/commerce/subscriptions/subscription-1')
    render(<App />)
    await screen.findByText('Historique de facturation')

    await pickVariant()

    // First click only opens a confirmation — the fiche's own acceptance
    // criterion is that a plan change (it can charge money immediately) is
    // never applied on one click.
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier le changement' }))
    expect(screen.getByText(/Ce changement s'applique immédiatement/)).toBeDefined()
    expect(screen.queryByText('Formule changée.', { exact: false })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le changement' }))

    expect(
      await screen.findByText("Formule changée. Rien n'était dû pour le reste de cette période."),
    ).toBeDefined()
    // The panel closes on success — its own heading is gone, only the
    // "Changer de formule" toggle button (which reopens it) remains.
    expect(screen.queryByRole('heading', { name: 'Changer de formule' })).toBeNull()
  })

  it('refuses to change plan without commerce.order.write', async () => {
    localStorage.clear()
    localStorage.setItem('cogenta.session.token', VALID_TOKEN)
    installMockFetch({ roles: ['viewer'], ...seededCatalog })
    window.history.pushState(null, '', '/commerce/subscriptions/subscription-1')
    render(<App />)
    await screen.findByText('Historique de facturation')

    await pickVariant()
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier le changement' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le changement' }))

    expect(await screen.findByText(/allowed to do that/u)).toBeDefined()
  })
})
