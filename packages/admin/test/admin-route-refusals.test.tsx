import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('direct access to operational pages without admin permissions', () => {
  for (const role of ['viewer', 'editor']) {
    it.each([
      ['health', 'Santé'],
      ['tools', 'Outils'],
      ['scheduled', 'Tâches planifiées'],
    ])(
      `shows a named refusal on /%s for ${role}, without fetching privileged data`,
      async (path, heading) => {
        localStorage.setItem('cogenta.session.token', VALID_TOKEN)
        installMockFetch({ roles: [role] })
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
        window.history.pushState(null, '', `/${path}`)
        render(<App />)
        await screen.findByRole('heading', { name: heading, level: 1 })
        const page = screen.getByRole('region', { name: heading })
        expect(within(page).getByRole('alert').textContent).toBe(
          'Cette page est réservée aux administrateurs. Votre compte n’a pas les permissions nécessaires ; contactez un administrateur si vous devez y accéder.',
        )
        expect(within(page).queryByRole('button')).toBeNull()
        expect(
          fetchSpy.mock.calls.some(
            ([resource]) =>
              typeof resource === 'string' &&
              /\/api\/(?:health|tools|scheduled|migrations|maintenance|disk-usage|error-log|audit-integrity)(?:[/?-]|$)/u.test(
                resource,
              ),
          ),
        ).toBe(false)
      },
    )
  }
})
