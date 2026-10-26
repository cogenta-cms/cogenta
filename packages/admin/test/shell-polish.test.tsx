import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../src/i18n/index.js'
import { pickDefaultAgent } from '../src/assist/agent-chat-widget.js'
import { PasswordInput } from '../src/auth/password-input.js'
import { i18next } from '../src/i18n/index.js'
import { browserLabel, deviceLabel } from '../src/lib/session-labels.js'
import { ResetPasswordRoute } from '../src/routes/reset-password.js'
import {
  collectionLabel,
  languageName,
  marketplaceKindLabel,
  mediaKindLabel,
  menuDisplayName,
} from '../src/search/result-labels.js'
import { breadcrumbFor } from '../src/shell/breadcrumb.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('breadcrumbFor', () => {
  it('names screens the sidebar does not list', () => {
    expect(breadcrumbFor('/search', null)).toEqual([{ labelKey: 'breadcrumb.search' }])
  })

  it('names an unknown path as a page that was not found, so its tab is not just "Cogenta"', () => {
    expect(breadcrumbFor('/nexiste-pas', null)).toEqual([{ labelKey: 'breadcrumb.notFound' }])
  })

  it('still resolves a listed screen by its longest prefix', () => {
    expect(breadcrumbFor('/commerce/orders/abc', null)).toEqual([
      { labelKey: 'nav.commerceOrders' },
    ])
  })
})

describe('search result labels', () => {
  it('shows a collection by its singular label and falls back to its name', () => {
    const collections = [
      { name: 'post', labels: { singular: 'Actualité', plural: 'Actualités' } },
    ] as never
    expect(collectionLabel(collections, 'post')).toBe('Actualité')
    expect(collectionLabel(collections, 'ghost')).toBe('ghost')
    expect(collectionLabel(null, 'post')).toBe('post')
  })

  it('shows media and extension kinds as words', () => {
    const t = i18next.getFixedT('fr')
    expect(mediaKindLabel(t, 'image')).toBe('Image')
    expect(marketplaceKindLabel(t, 'plugin')).toBe('Extension')
    expect(mediaKindLabel(t, 'hologram')).toBe('Hologram')
  })

  it('shows a locale code as a language name', () => {
    expect(languageName('fr', 'fr')).toBe('français')
    expect(languageName('en', 'fr')).toBe('anglais')
  })

  it('shows a slug-style menu name as words and leaves a real name alone', () => {
    expect(menuDisplayName('header-action')).toBe('Header Action')
    expect(menuDisplayName('Menu principal')).toBe('Menu principal')
  })
})

describe('session labels', () => {
  it('shows browser and device tokens as words', () => {
    const t = i18next.getFixedT('fr')
    expect(browserLabel(t, 'chrome')).toBe('Chrome')
    expect(deviceLabel(t, 'desktop')).toBe('ordinateur')
    expect(deviceLabel(t, 'tablet')).toBe('tablette')
  })
})

describe('pickDefaultAgent', () => {
  const agents = [
    { name: 'Accessibility Auditor', enabled: false, builtin: true },
    { name: 'Cogenta Agent', enabled: true, builtin: true },
    { name: 'My Agent', enabled: true, builtin: false },
  ] as never

  it('never offers a disabled agent, even when it is the first built-in one', () => {
    expect(pickDefaultAgent(agents, null)).toBe('Cogenta Agent')
  })

  it('keeps the agent the person chose last while it still runs', () => {
    expect(pickDefaultAgent(agents, 'My Agent')).toBe('My Agent')
    expect(pickDefaultAgent(agents, 'Accessibility Auditor')).toBe('Cogenta Agent')
  })

  it('answers an empty name when no agent is switched on', () => {
    expect(pickDefaultAgent([{ name: 'Off', enabled: false, builtin: true }] as never, null)).toBe(
      '',
    )
  })
})

describe('PasswordInput', () => {
  it('reveals and hides the password through a labelled toggle', () => {
    render(<PasswordInput aria-label="mot de passe" defaultValue="secret" />)
    const input = screen.getByLabelText('mot de passe') as HTMLInputElement
    expect(input.type).toBe('password')
    const toggle = screen.getByRole('button', { name: 'Afficher le mot de passe' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(input.type).toBe('text')
    expect(
      screen.getByRole('button', { name: 'Masquer le mot de passe' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })
})

function stubResetApi(resetResponse: { status: number; body: unknown }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/api/auth/password-policy')) {
        return new Response(JSON.stringify({ data: { minLength: 12 } }), { status: 200 })
      }
      if (url.includes('/api/auth/reset-password')) {
        return new Response(JSON.stringify(resetResponse.body), { status: resetResponse.status })
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    }),
  )
}

function renderReset(search: string): void {
  render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <ResetPasswordRoute />
    </MemoryRouter>,
  )
}

describe('reset password screen', () => {
  it('says what to do when the link is no longer valid, in French, with a way to ask for a new one', async () => {
    stubResetApi({
      status: 400,
      body: {
        error: { code: 'AUTH_RESET_TOKEN_INVALID', message: 'This reset link is not valid.' },
      },
    })
    renderReset('?token=abc')

    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'une phrase de passe assez longue' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }))

    expect(await screen.findByText(/n’est plus valable/u)).toBeDefined()
    expect(screen.queryByText('This reset link is not valid.')).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Demander un nouveau lien' }).getAttribute('href'),
    ).toBe('/forgot-password')
  })

  it('asks for the password in the admin language instead of a browser bubble', async () => {
    stubResetApi({ status: 200, body: {} })
    renderReset('?token=abc')

    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }))

    expect(await screen.findByText('Saisissez votre mot de passe.')).toBeDefined()
  })

  it('counts the missing characters with a real plural', async () => {
    stubResetApi({ status: 200, body: {} })
    renderReset('?token=abc')
    await waitFor(() => expect(fetch).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'onze chars!' },
    })
    expect(await screen.findByText('Encore 1 caractère nécessaire.')).toBeDefined()
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'abc' } })
    expect(await screen.findByText('Encore 9 caractères nécessaires.')).toBeDefined()
  })

  it('without a token, offers a new link and the way back to sign-in', () => {
    stubResetApi({ status: 200, body: {} })
    renderReset('')
    expect(screen.getByRole('link', { name: 'Demander un nouveau lien' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Retour à la connexion' })).toBeDefined()
  })
})
