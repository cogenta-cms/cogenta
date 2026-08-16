import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
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

async function goToUsers(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Utilisateurs' }))
  await screen.findByRole('heading', { name: 'Utilisateurs' })
}

/**
 * Queries are scoped to the table on purpose: the shell's top bar also shows the
 * signed-in account's email, and the role filter repeats every role name as an
 * `<option>` — an unscoped `getByText` matches those too and proves nothing
 * about the list.
 */
function table(): HTMLElement {
  return screen.getByRole('table')
}

describe('the user list', () => {
  it('shows every account with its roles, status and whether it has a second factor', async () => {
    render(<App />)
    await goToUsers()

    const rows = within(await screen.findByRole('table'))
    expect(rows.getByText('alice@example.com')).toBeDefined()
    expect(rows.getByText('bob@example.com')).toBeDefined()
    // bob has TOTP in the fixture, alice does not.
    expect(rows.getByText('Activé')).toBeDefined()
    expect(rows.getByText('Aucun')).toBeDefined()
  })

  it('filters by role', async () => {
    render(<App />)
    await goToUsers()
    await within(await screen.findByRole('table')).findByText('bob@example.com')

    fireEvent.change(screen.getByLabelText('Filtrer par rôle'), { target: { value: 'viewer' } })

    await waitFor(() => {
      expect(within(table()).queryByText('alice@example.com')).toBeNull()
    })
    expect(within(table()).getByText('bob@example.com')).toBeDefined()
  })

  /**
   * R4's UI half. The refusal that matters is the server's — proved against the
   * real router in `packages/api/test/rest/users-router.test.ts` — but a screen
   * full of buttons that 403 is its own kind of broken.
   */
  it('tells a non-admin plainly instead of rendering controls that would be refused', async () => {
    signedInAs(['editor'])
    render(<App />)
    await goToUsers()

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Réservé au rôle « admin » : cette page crée des comptes et change des rôles.',
    )
    expect(screen.queryByRole('button', { name: 'Nouvel utilisateur' })).toBeNull()
  })
})

describe('creating an account', () => {
  it('creates it and shows the generated password exactly once', async () => {
    render(<App />)
    await goToUsers()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvel utilisateur' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer un utilisateur' })

    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'carol@example.com' },
    })
    // "Éditeur" is checked by default; a custom role is added on top of it,
    // the same way "editor, reviewer" combined a standard and an ad hoc role
    // before the checkbox list existed.
    fireEvent.change(screen.getByLabelText('Rôle personnalisé (optionnel)'), {
      target: { value: 'reviewer' },
    })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    expect(await screen.findByText('generated-password-xyz')).toBeDefined()
    await waitFor(() => {
      expect(within(table()).getByText('carol@example.com')).toBeDefined()
    })
  })

  it('hides the password again once it has been noted', async () => {
    render(<App />)
    await goToUsers()

    fireEvent.click(screen.getByRole('button', { name: 'Nouvel utilisateur' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer un utilisateur' })
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'carol@example.com' },
    })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)
    await screen.findByText('generated-password-xyz')

    fireEvent.click(screen.getByRole('button', { name: 'Masquer le mot de passe' }))

    await waitFor(() => {
      expect(screen.queryByText('generated-password-xyz')).toBeNull()
    })
  })
})

describe('changing an account', () => {
  it('changes a role', async () => {
    render(<App />)
    await goToUsers()
    await screen.findByText('bob@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Changer les rôles de bob@example.com' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rôles de bob@example.com' })
    // Bob starts with "viewer" (not a standard role, so it appears as its own
    // checkbox, pre-checked). Uncheck it and add "reviewer" as a custom role,
    // to land on exactly one role, same as the old free-text field did.
    fireEvent.click(within(dialog).getByLabelText('viewer'))
    fireEvent.change(within(dialog).getByLabelText('Rôle personnalisé (optionnel)'), {
      target: { value: 'reviewer' },
    })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    await waitFor(() => {
      expect(within(table()).getByText('reviewer')).toBeDefined()
    })
  })

  it('disables an account and offers to re-enable it', async () => {
    render(<App />)
    await goToUsers()
    await within(await screen.findByRole('table')).findByText('bob@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver bob@example.com' }))

    expect(await screen.findByRole('button', { name: 'Réactiver bob@example.com' })).toBeDefined()
    expect(within(table()).getByText('Désactivé')).toBeDefined()
  })
})

describe("another account's sessions", () => {
  it('lists them and revokes one', async () => {
    render(<App />)
    await goToUsers()
    await screen.findByText('bob@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Voir les sessions de bob@example.com' }))
    await screen.findByRole('dialog', { name: 'Sessions de bob@example.com' })
    expect(await screen.findByText(/Phone/u)).toBeDefined()

    fireEvent.click(
      screen.getByRole('button', { name: 'Révoquer la session vue le 2026-03-03T00:00:00.000Z' }),
    )

    expect(await screen.findByText('Aucune session active.')).toBeDefined()
  })
})

describe('the user list, for accessibility', () => {
  it('has no serious accessibility violation', async () => {
    const { container } = render(<App />)
    await goToUsers()
    await screen.findByText('bob@example.com')

    await expectNoSeriousA11yViolations(container)
  })
})
