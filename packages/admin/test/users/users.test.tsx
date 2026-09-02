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
    // The "Comptes" nav group is hidden for a role with no visible item in
    // it (fiche 35): there is no link to click, so go straight to the
    // route, the same way a bookmarked URL would.
    window.history.pushState(null, '', '/users')
    render(<App />)

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

/**
 * Fiche 17 task 1 — invitation by email, with its R1 fallback. The two mock
 * paths (`invitationEmailAvailable: true`/absent) mirror what the real
 * `meta.invitationEmailAvailable` flag drives (`packages/api/test/rest/users-router.test.ts`
 * proves the server side; `packages/cli/test/serve-users.test.ts` proves the
 * whole thing end to end over real HTTP and a real mail file).
 */
describe('inviting an account by email', () => {
  it('offers the invitation checkbox and shows "invitation sent" instead of a password', async () => {
    installMockFetch({ roles: ['admin'], invitationEmailAvailable: true })
    render(<App />)
    await goToUsers()
    await within(await screen.findByRole('table')).findByText('bob@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Nouvel utilisateur' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer un utilisateur' })
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'dave@example.com' },
    })
    expect(
      (
        within(dialog).getByLabelText(
          'Envoyer une invitation par e-mail plutôt que de créer un mot de passe maintenant',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true)
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    expect(await screen.findByText('Invitation envoyée à dave@example.com')).toBeDefined()
    expect(screen.queryByText(/generated-password-xyz/u)).toBeNull()
    await waitFor(() => {
      expect(within(table()).getByText('dave@example.com')).toBeDefined()
    })
    expect(within(table()).getByText('Invitation envoyée')).toBeDefined()
  })

  it('falls back to a shown-once password with no email transport configured', async () => {
    render(<App />)
    await goToUsers()
    await within(await screen.findByRole('table')).findByText('bob@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Nouvel utilisateur' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer un utilisateur' })
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'dave@example.com' },
    })
    expect(
      within(dialog).getByText(
        "Aucun transport e-mail n'est configuré sur ce site : le compte est créé avec un mot de passe affiché une fois.",
      ),
    ).toBeDefined()
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)

    expect(await screen.findByText('generated-password-xyz')).toBeDefined()
  })

  it('resends and then cancels a pending invitation', async () => {
    installMockFetch({ roles: ['admin'], invitationEmailAvailable: true })
    render(<App />)
    await goToUsers()
    await within(await screen.findByRole('table')).findByText('bob@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Nouvel utilisateur' }))
    const dialog = await screen.findByRole('dialog', { name: 'Créer un utilisateur' })
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'dave@example.com' },
    })
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement)
    await screen.findByText('Invitation envoyée à dave@example.com')

    fireEvent.click(
      screen.getByRole('button', { name: "Renvoyer l'invitation à dave@example.com" }),
    )
    expect(
      await screen.findByText('Une nouvelle invitation a été envoyée à dave@example.com.'),
    ).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: "Annuler l'invitation à dave@example.com" }))
    expect(await screen.findByText("L'invitation à dave@example.com a été annulée.")).toBeDefined()
    await waitFor(() => {
      expect(within(table()).queryByText('dave@example.com')).toBeNull()
    })
  })
})

describe('bulk actions', () => {
  it('disables several selected accounts at once', async () => {
    render(<App />)
    await goToUsers()
    await within(await screen.findByRole('table')).findByText('bob@example.com')

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Sélectionner tous les comptes de cette page' }),
    )
    expect(await screen.findByText('2 comptes sélectionnés')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver la sélection' }))

    await waitFor(() => {
      expect(within(table()).getAllByText('Désactivé').length).toBeGreaterThan(0)
    })
  })
})

describe('anonymizing an account', () => {
  it('requires typing the exact email before the confirm button is enabled', async () => {
    render(<App />)
    await goToUsers()
    await within(await screen.findByRole('table')).findByText('bob@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Anonymiser bob@example.com' }))
    const dialog = await screen.findByRole('dialog', { name: 'Anonymiser bob@example.com' })
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Anonymiser ce compte',
    }) as HTMLButtonElement
    expect(confirmButton.disabled).toBe(true)

    fireEvent.change(within(dialog).getByLabelText('Tapez bob@example.com pour confirmer'), {
      target: { value: 'wrong@example.com' },
    })
    expect(confirmButton.disabled).toBe(true)

    fireEvent.change(within(dialog).getByLabelText('Tapez bob@example.com pour confirmer'), {
      target: { value: 'bob@example.com' },
    })
    expect(confirmButton.disabled).toBe(false)

    fireEvent.click(confirmButton)

    expect(await screen.findByText('Le compte a été anonymisé.')).toBeDefined()
    await waitFor(() => {
      expect(within(table()).queryByText('bob@example.com')).toBeNull()
    })
  })
})

/** T09-04 (RGPD) — an admin exporting another account's personal data. */
describe("exporting another account's personal data", () => {
  it('downloads a JSON file for the selected account', async () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-personal-data')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    render(<App />)
    await goToUsers()
    await within(await screen.findByRole('table')).findByText('bob@example.com')

    fireEvent.click(
      screen.getByRole('button', { name: 'Exporter les données personnelles de bob@example.com' }),
    )

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1)
    })
    const [blob] = createObjectURL.mock.calls[0] as [Blob]
    expect(blob.type).toBe('application/json')

    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
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
