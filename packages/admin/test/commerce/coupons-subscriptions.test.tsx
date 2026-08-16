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
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(screen.getByRole('link', { name: 'Abonnements' }))
    await screen.findByRole('heading', { name: 'Abonnements' })

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(await screen.findByText(/allowed to do that/u)).toBeDefined()
  })
})
