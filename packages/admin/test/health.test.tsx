import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToHealth(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Santé' }))
  await screen.findByRole('heading', { name: 'Santé' })
}

describe('health screen — driver reasons', () => {
  it('translates every driver-selection reason instead of showing the raw English sentence', async () => {
    // L20 audit §1 point 12: `@cogenta/core`'s driver registry composes
    // English prose ("named in the configuration", "redis not available")
    // for `cogenta doctor`'s terminal output — this screen must show its own
    // French translation of the stable `reasonCode`, never that text as-is.
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      healthReport: {
        checks: [
          {
            need: 'database',
            status: 'ok',
            driver: 'postgres',
            tier: 'optimal',
            reason: 'named in the configuration',
            reasonCode: { code: 'named', skipped: [] },
          },
          {
            need: 'cache',
            status: 'degraded',
            driver: 'memory',
            tier: 'degraded',
            reason: 'redis not available',
            reasonCode: {
              code: 'fallback',
              skipped: [{ driver: 'redis', tier: 'optimal', reasonCode: 'not-available' }],
            },
          },
        ],
      },
    })

    render(<App />)
    await goToHealth()

    // The translated stand-ins for each reason code appear...
    expect(await screen.findByText(/configuré explicitement/)).toBeDefined()
    expect(screen.getByText(/après repli sur.*redis indisponible/)).toBeDefined()
    // ...and the raw English phrases the server would otherwise have sent do not.
    expect(screen.queryByText(/named in the configuration/)).toBeNull()
    expect(screen.queryByText(/redis not available/)).toBeNull()
  })

  it('falls back to the raw reason text when a server sends no reasonCode', async () => {
    // Defensive path for a server built before this field existed — never a
    // blank line where a reason used to be.
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      healthReport: {
        checks: [
          {
            need: 'database',
            status: 'ok',
            driver: 'sqlite',
            tier: 'degraded',
            reason: 'first available driver',
          },
        ],
      },
    })

    render(<App />)
    await goToHealth()

    expect(await screen.findByText(/first available driver/)).toBeDefined()
  })
})
