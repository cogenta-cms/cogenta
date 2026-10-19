import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles: ['admin'] })
})

afterEach(() => vi.unstubAllGlobals())

describe('missing detail records retain a named page and a way back', () => {
  it.each([
    [
      '/commerce/orders/does-not-exist',
      'Commandes',
      "Cette commande n'existe pas.",
      '/commerce/orders',
    ],
    [
      '/commerce/customers/does-not-exist',
      'Client',
      "Ce client n'existe pas.",
      '/commerce/customers',
    ],
    [
      '/commerce/subscriptions/does-not-exist',
      "Détail de l'abonnement",
      "Cet abonnement n'existe pas.",
      '/commerce/subscriptions',
    ],
    ['/agents/does-not-exist', 'Agents', "Cet agent n'existe pas ou plus.", '/agents'],
  ])(
    'shows a heading, translated explanation and return link at %s',
    async (path, title, message, back) => {
      window.history.pushState(null, '', path)
      render(<App />)
      await screen.findByText(message)
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeDefined()
      expect(screen.getByRole('link', { name: /Retour/u }).getAttribute('href')).toBe(back)
    },
  )
})
