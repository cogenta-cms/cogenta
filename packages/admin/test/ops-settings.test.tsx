import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfigStatus } from '../src/api/ops-status-client.js'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * `GET /api/security-status` and `GET /api/webhooks-status` — read-only
 * mirrors of the config file (audit follow-up to L10 task 6 / L14 task 1).
 * No form anywhere on this screen: that is the point being tested.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(
  roles: readonly string[],
  webhooksStatus?: {
    endpoints: readonly string[]
    signed: boolean
    disabledForMissingSecret: boolean
  },
  configStatus?: ConfigStatus,
): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({
    roles,
    ...(webhooksStatus === undefined ? {} : { webhooksStatus }),
    ...(configStatus === undefined ? {} : { configStatus }),
  })
}

const SAMPLE_CONFIG_STATUS: ConfigStatus = {
  site: { name: 'Test site', url: 'https://example.com', notFoundPath: '/404' },
  database: { driver: 'sqlite' },
  cache: { driver: 'memory' },
  queue: { driver: 'memory' },
  storage: { driver: 'local', bucket: undefined, region: undefined, endpoint: undefined },
  llm: undefined,
  embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
  imageGeneration: undefined,
  vector: { driver: 'memory' },
  billingConfigured: false,
  secretHygiene: {
    databaseUrlHasCredentialsInFile: false,
    envFilePath: null,
    envFileReadableByOthers: null,
  },
}

async function goToOpsSettings(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Sécurité & webhooks' }))
  await screen.findByRole('heading', { name: 'Sécurité & webhooks' })
}

describe('the security & webhooks screen', () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    // The "Exploitation" nav group is hidden for a role with no visible item
    // in it (fiche 35): there is no link to click, so go straight to the
    // route, the same way a bookmarked URL would.
    window.history.pushState(null, '', '/ops-settings')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('shows an admin the resolved security configuration, with no editable field', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToOpsSettings()

    expect(await screen.findByText('Sécurité HTTP')).toBeDefined()
    expect(
      screen.getByText("Désactivé — aucune origine n'est configurée.", { exact: false }),
    ).toBeDefined()
    // Read-only: no input, no button that submits a change.
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /enregistrer|save/i })).toBeNull()
  })

  it('shows configured webhook endpoints and flags a missing signing secret', async () => {
    signedIn(['admin'], {
      endpoints: ['https://receiver.example/webhook'],
      signed: false,
      disabledForMissingSecret: true,
    })
    render(<App />)
    await goToOpsSettings()

    expect(await screen.findByText('https://receiver.example/webhook')).toBeDefined()
    expect(screen.getByText(/COGENTA_WEBHOOK_SECRET n'est pas défini/)).toBeDefined()
  })

  it('shows no endpoints as a plain statement, not an error', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToOpsSettings()

    expect(await screen.findByText("Aucun endpoint de webhook n'est configuré.")).toBeDefined()
  })

  describe('the infrastructure mirror (fiche 23 task 5)', () => {
    it('mirrors driver and provider names, still with no editable field', async () => {
      signedIn(['admin'], undefined, SAMPLE_CONFIG_STATUS)
      render(<App />)
      await goToOpsSettings()

      expect(await screen.findByText('Infrastructure')).toBeDefined()
      expect(screen.getByText('sqlite')).toBeDefined()
      expect(screen.getByText('local (all-MiniLM-L6-v2)')).toBeDefined()
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('flags a database URL with embedded credentials in the config file', async () => {
      signedIn(['admin'], undefined, {
        ...SAMPLE_CONFIG_STATUS,
        secretHygiene: {
          databaseUrlHasCredentialsInFile: true,
          envFilePath: null,
          envFileReadableByOthers: null,
        },
      })
      render(<App />)
      await goToOpsSettings()

      expect(await screen.findByText(/contient des identifiants réels/)).toBeDefined()
    })

    it('flags an .env file readable by other tenants on shared hosting', async () => {
      signedIn(['admin'], undefined, {
        ...SAMPLE_CONFIG_STATUS,
        secretHygiene: {
          databaseUrlHasCredentialsInFile: false,
          envFilePath: '/site/.env',
          envFileReadableByOthers: true,
        },
      })
      render(<App />)
      await goToOpsSettings()

      expect(await screen.findByText(/lisible par d'autres utilisateurs/)).toBeDefined()
      expect(screen.getByText(/\/site\/\.env/)).toBeDefined()
    })

    it('says the .env permissions look fine when they are', async () => {
      signedIn(['admin'], undefined, {
        ...SAMPLE_CONFIG_STATUS,
        secretHygiene: {
          databaseUrlHasCredentialsInFile: false,
          envFilePath: '/site/.env',
          envFileReadableByOthers: false,
        },
      })
      render(<App />)
      await goToOpsSettings()

      expect(await screen.findByText(/semblent correctement restreintes/)).toBeDefined()
    })

    it('renders nothing extra when the server never wired a config mirror', async () => {
      signedIn(['admin'])
      render(<App />)
      await goToOpsSettings()

      await screen.findByText('Sécurité HTTP')
      expect(screen.queryByText('Infrastructure')).toBeNull()
    })
  })
})
