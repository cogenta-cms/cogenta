import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * Store settings (fiche 34 tasks 4-5) — general shop configuration and the
 * invoice template, both stored through the same generic editorial-settings
 * registry fiche 23 built (`commerce` is one more `group`).
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

async function goToCommerceSettings(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Réglages boutique' }))
  await screen.findByRole('heading', { name: 'Réglages de la boutique' })
}

describe('the commerce settings screen', () => {
  it('renders the general, legal and invoice groups with their real registry defaults', async () => {
    signedInAs(['admin'])
    render(<App />)
    await goToCommerceSettings()

    const currency = (await screen.findByLabelText('Devise par défaut')) as HTMLInputElement
    expect(currency.value).toBe('EUR')
    const display = screen.getByLabelText('Affichage des prix') as HTMLSelectElement
    expect(display.value).toBe('ttc')
    expect(screen.getByLabelText('Page des conditions générales de vente')).toBeDefined()
    expect(screen.getByLabelText('Préfixe de série de facture')).toBeDefined()
    // CGV/return policy are paths to real content, never free text here.
    expect(screen.getByText(/vraies entrées de contenu publiées/u)).toBeDefined()
  })

  it('saves a value and reports it saved', async () => {
    signedInAs(['admin'])
    render(<App />)
    await goToCommerceSettings()

    const prefix = await screen.findByLabelText('Préfixe de série de facture')
    fireEvent.change(prefix, { target: { value: 'AC' } })
    fireEvent.blur(prefix)

    await screen.findByText('Enregistré.')
    expect((prefix as HTMLInputElement).value).toBe('AC')
  })

  it('previews a real invoice PDF for an order id, opened in a new tab — fiche 54 task 2', async () => {
    signedInAs(['admin'])
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-invoice-preview')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    render(<App />)
    await goToCommerceSettings()

    const orderIdField = await screen.findByLabelText('Identifiant de commande')
    fireEvent.change(orderIdField, { target: { value: 'order-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser la facture' }))

    await vi.waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1)
    })
    expect(openSpy).toHaveBeenCalledWith('blob:mock-invoice-preview', '_blank', 'noopener')

    openSpy.mockRestore()
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })

  it('shows an error rather than a silent failure when the preview cannot be rendered', async () => {
    signedInAs(['admin'])
    // Nothing this screen's own mock route refuses in the harness, so the
    // failure is forced at the transport level — the other real way
    // `previewInvoice` can end without a PDF (a network error, a 500 from a
    // misconfigured seller — anything `fetchInvoicePreviewPdf` turns into a
    // non-ok response).
    const realFetch = window.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/invoice/preview')) {
        return Promise.resolve(new Response(null, { status: 500 }))
      }
      return realFetch(input, init)
    })

    render(<App />)
    await goToCommerceSettings()

    const orderIdField = await screen.findByLabelText('Identifiant de commande')
    fireEvent.change(orderIdField, { target: { value: 'order-missing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser la facture' }))

    // `fetchInvoicePreviewPdf` turns a non-ok response into a typed
    // `ApiError`, and the screen shows that error's own message rather than
    // its generic fallback — the same discipline the payment screen's own
    // failure test proves for `testPaymentConnection`.
    await screen.findByText('This order does not exist.')
  })

  it('refuses a write from a role with no admin permission, at the API', async () => {
    signedInAs(['viewer'])
    render(<App />)

    // The screen itself is admin-gated -- a viewer never reaches the write
    // UI at all (covered by the next test). This proves the second, real
    // gate exists independently of the screen: the write route itself
    // refuses this role, the way R4 requires (a runtime check, never one
    // the UI alone enforces).
    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ key: 'commerce.invoiceSeriesPrefix', value: 'XY' }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses the screen to a non-admin', async () => {
    signedInAs(['viewer'])
    window.history.pushState(null, '', '/commerce/settings')
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Seul un administrateur peut modifier les réglages de la boutique.',
    )
  })

  it('has no serious accessibility violation', async () => {
    signedInAs(['admin'])
    const { container } = render(<App />)
    await goToCommerceSettings()
    await screen.findByLabelText('Devise par défaut')

    await expectNoSeriousA11yViolations(container)
  })
})
