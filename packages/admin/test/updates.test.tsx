import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UpdateCheckReport, UpdatePackageStatus } from '../src/api/updates-client.js'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * "Mises à jour" (L22 task 9) — its own screen, split out of the "Sécurité &
 * webhooks" screen by fiche 66 (its title had nothing to do with updates).
 * Checking npm, applying an update with a mandatory restore point, and the
 * confirmation dialog a contract-risk warning forces before anything is
 * applied — same behaviour as before the extraction, only reached from its
 * own nav entry and route now.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedInAdmin(options: Parameters<typeof installMockFetch>[0] = {}): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles: ['admin'], ...options })
}

async function goToUpdates(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Mises à jour' }))
  await screen.findByRole('heading', { name: 'Mises à jour' })
}

const CORE_UP_TO_DATE: UpdatePackageStatus = {
  name: '@cogenta/core',
  installed: '0.4.0',
  latest: '0.5.0',
  bump: 'minor',
  updateAvailable: true,
  checkError: undefined,
  contractRisk: { available: true, reason: undefined, scannedVersions: ['0.5.0'], warnings: [] },
}

const CORE_RISKY: UpdatePackageStatus = {
  ...CORE_UP_TO_DATE,
  contractRisk: {
    available: true,
    reason: undefined,
    scannedVersions: ['0.5.0'],
    warnings: [{ version: '0.5.0', excerpt: 'Contract A moves to schema@2.2.' }],
  },
}

const CLI_UP_TO_DATE: UpdatePackageStatus = {
  name: '@cogenta/cli',
  installed: '0.4.0',
  latest: '0.4.0',
  bump: 'none',
  updateAvailable: false,
  checkError: undefined,
  contractRisk: null,
}

const AVAILABLE_STATUS: UpdateCheckReport = {
  checkedAt: '2026-08-21T00:00:00.000Z',
  packages: [CORE_UP_TO_DATE, CLI_UP_TO_DATE],
  updateAvailable: true,
  highestBump: 'minor',
  contractRiskDetected: false,
}

const RISKY_STATUS: UpdateCheckReport = {
  ...AVAILABLE_STATUS,
  contractRiskDetected: true,
  packages: [CORE_RISKY, CLI_UP_TO_DATE],
}

describe('the Updates screen', () => {
  it('shows each package status', async () => {
    signedInAdmin({ updateStatus: AVAILABLE_STATUS })
    render(<App />)
    await goToUpdates()

    expect(screen.getByText('@cogenta/core')).toBeDefined()
    expect(screen.getByText('0.4.0 → 0.5.0 (minor)', { exact: false })).toBeDefined()
    expect(screen.getByText('@cogenta/cli')).toBeDefined()
  })

  it('applies an update and shows a success message with no risk found', async () => {
    signedInAdmin({
      updateStatus: AVAILABLE_STATUS,
      updateApplyResult: {
        kind: 'applied',
        report: AVAILABLE_STATUS,
        restorePoint: {
          path: '.cogenta/backups/update-1.zip',
          createdAt: '2026-08-21T00:00:01.000Z',
          tableCount: 5,
          rowCount: 10,
          checksum: 'deadbeef',
        },
        installed: [{ name: '@cogenta/core', version: '0.5.0' }],
      },
    })
    render(<App />)
    await goToUpdates()

    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }))

    await screen.findByText(/Mis à jour/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a confirmation dialog instead of applying, when a contract-risk warning was found', async () => {
    signedInAdmin({
      updateStatus: RISKY_STATUS,
      updateApplyResult: {
        kind: 'confirmation-required',
        report: RISKY_STATUS,
        risky: [CORE_RISKY],
      },
    })
    render(<App />)
    await goToUpdates()

    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }))

    await screen.findByRole('dialog')
    expect(screen.getByText('Cette mise à jour pourrait toucher un contrat figé')).toBeDefined()
    expect(screen.getByText(/Contract A moves to schema@2.2/)).toBeDefined()

    // Cancelling closes it without ever calling the applier a second time
    // with confirmation — nothing was touched.
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('refuses the screen to a non-admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    window.history.pushState(null, '', '/updates')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
    // Only the (admin-only) heading is rendered — no package status, no
    // controls, since the guard returns before ever calling the update API.
    expect(screen.queryByRole('button', { name: 'Vérifier maintenant' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mettre à jour' })).toBeNull()
  })
})
