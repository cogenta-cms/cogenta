import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

const startRegistration = vi.fn()
vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: (...args: unknown[]) => startRegistration(...args),
}))

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  startRegistration.mockReset()
  installMockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToProfile(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Mon profil' }))
  await screen.findByRole('heading', { name: 'Mon profil' })
}

describe('my profile — password', () => {
  it('changes the password when the current one is right', async () => {
    render(<App />)
    await goToProfile()

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
      target: { value: 'correct horse battery staple' },
    })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'a much longer new passphrase' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))

    expect(await screen.findByText('Mot de passe modifié.')).toBeDefined()
  })

  it('reports the server refusing a wrong current password, without pretending it worked', async () => {
    render(<App />)
    await goToProfile()

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
      target: { value: 'not it' },
    })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'a much longer new passphrase' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))

    expect(await screen.findByText('The current password is not correct.')).toBeDefined()
    expect(screen.queryByText('Mot de passe modifié.')).toBeNull()
  })
})

describe('my profile — second factor', () => {
  it('walks the TOTP enrolment: key, code, confirmed', async () => {
    render(<App />)
    await goToProfile()

    fireEvent.click(
      screen.getByRole('button', { name: "Configurer une application d'authentification" }),
    )
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(await screen.findByText('Vérification en deux étapes activée.')).toBeDefined()
  })

  it('reports a wrong confirmation code and stays on the enrolment step', async () => {
    render(<App />)
    await goToProfile()

    fireEvent.click(
      screen.getByRole('button', { name: "Configurer une application d'authentification" }),
    )
    await screen.findByText('JBSWY3DPEHPK3PXP')

    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(await screen.findByText('Incorrect verification code.')).toBeDefined()
    expect(screen.getByLabelText('Code à 6 chiffres')).toBeDefined()
  })

  it('registers a passkey — the section the settings page used to hold', async () => {
    startRegistration.mockResolvedValue({ id: 'mock-new-credential-id' })
    render(<App />)
    await goToProfile()

    fireEvent.change(screen.getByLabelText("Nom de l'appareil (facultatif)"), {
      target: { value: 'Ordinateur portable' },
    })
    fireEvent.click(screen.getByRole('button', { name: "Ajouter une clé d'accès" }))

    expect(await screen.findByText("Clé d'accès ajoutée.")).toBeDefined()
    expect(startRegistration).toHaveBeenCalledWith({
      optionsJSON: { challenge: 'register-challenge', rp: { id: 'example.com', name: 'Cogenta' } },
    })
  })

  it('reports a passkey the server refuses, without pretending it worked', async () => {
    startRegistration.mockResolvedValue({ id: 'some-other-credential' })
    render(<App />)
    await goToProfile()

    fireEvent.click(screen.getByRole('button', { name: "Ajouter une clé d'accès" }))

    expect(await screen.findByText('The passkey response could not be verified.')).toBeDefined()
    expect(screen.queryByText("Clé d'accès ajoutée.")).toBeNull()
  })
})

/** Fiche 18 task 1 — the priority of the whole fiche. */
describe('my profile — recovery codes', () => {
  it('shows ten codes exactly once, right after confirming TOTP enrolment', async () => {
    render(<App />)
    await goToProfile()

    fireEvent.click(
      screen.getByRole('button', { name: "Configurer une application d'authentification" }),
    )
    await screen.findByText('JBSWY3DPEHPK3PXP')
    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(
      await screen.findByText(
        'Enregistrez ces codes maintenant — ils ne seront plus jamais montrés',
      ),
    ).toBeDefined()
    expect(screen.getByText('CODE0-AAAAA')).toBeDefined()
    expect(
      screen
        .getAllByRole('listitem')
        .filter((item) => /^CODE\d-AAAAA$/u.test(item.textContent ?? '')),
    ).toHaveLength(10)
  })

  it('dismissing the just-issued codes replaces them with the remaining count', async () => {
    render(<App />)
    await goToProfile()

    fireEvent.click(
      screen.getByRole('button', { name: "Configurer une application d'authentification" }),
    )
    await screen.findByText('JBSWY3DPEHPK3PXP')
    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await screen.findByText('CODE0-AAAAA')

    fireEvent.click(screen.getByRole('button', { name: 'J’ai enregistré ces codes' }))

    expect(await screen.findByText('10 codes de récupération restants sur 10.')).toBeDefined()
    expect(screen.queryByText('CODE0-AAAAA')).toBeNull()
  })

  it('says recovery codes need TOTP first, for an account with none enabled', async () => {
    render(<App />)
    await goToProfile()

    expect(
      await screen.findByText(
        'Les codes de récupération sont émis dès que vous activez la vérification en deux étapes ci-dessus.',
      ),
    ).toBeDefined()
  })

  it('regenerating replaces the batch and shows the new one', async () => {
    installMockFetch({ password: 'correct horse battery staple' })
    render(<App />)
    await goToProfile()

    fireEvent.click(
      screen.getByRole('button', { name: "Configurer une application d'authentification" }),
    )
    await screen.findByText('JBSWY3DPEHPK3PXP')
    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await screen.findByText('CODE0-AAAAA')
    fireEvent.click(screen.getByRole('button', { name: 'J’ai enregistré ces codes' }))
    await screen.findByText('10 codes de récupération restants sur 10.')

    fireEvent.click(
      screen.getByRole('button', { name: 'Générer de nouveaux codes de récupération' }),
    )

    expect(
      await screen.findByText(
        'Enregistrez ces codes maintenant — ils ne seront plus jamais montrés',
      ),
    ).toBeDefined()
  })
})

describe('my profile — sessions', () => {
  it('lists this account’s own active sessions', async () => {
    render(<App />)
    await goToProfile()

    expect(await screen.findByText(/Work laptop/u)).toBeDefined()
    expect(screen.getByText(/Appareil sans nom/u)).toBeDefined()
  })

  it('revokes one session and leaves the other', async () => {
    render(<App />)
    await goToProfile()
    await screen.findByText(/Work laptop/u)

    fireEvent.click(
      screen.getByRole('button', { name: 'Révoquer la session vue le 2026-03-01T00:00:00.000Z' }),
    )

    await waitFor(() => {
      expect(screen.queryByText(/Work laptop/u)).toBeNull()
    })
    expect(screen.getByText(/Appareil sans nom/u)).toBeDefined()
  })
})

/** Fiche 18 task 2 — "sign out everywhere else" keeps the current session alive. */
describe('my profile — sign out everywhere else', () => {
  it('revokes the other sessions and reports how many, keeping this one signed in', async () => {
    render(<App />)
    await goToProfile()
    await screen.findByText(/Work laptop/u)

    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter toutes les autres sessions' }))

    expect(
      await screen.findByText(
        /1 autre\(s\) session\(s\) déconnectée\(s\)\. Celle-ci reste connectée\./u,
      ),
    ).toBeDefined()
    await waitFor(() => {
      expect(screen.queryByText(/Appareil sans nom/u)).toBeNull()
    })
    // The signed-in account's own device is still listed — nothing signed
    // this browser out.
    expect(screen.getByText(/Work laptop/u)).toBeDefined()
  })
})

/** Fiche 18 task 4 — "my activity". */
describe('my profile — activity', () => {
  it('lists the caller’s own recent actions', async () => {
    render(<App />)
    await goToProfile()

    expect(await screen.findByRole('heading', { name: 'Mon activité' })).toBeDefined()
    expect(await screen.findByText('user.password_change')).toBeDefined()
    expect(screen.getByText('auth.login')).toBeDefined()
  })
})

/** Fiche 18 task 3 — the policy announced before it is enforced. */
describe('my profile — password policy', () => {
  it('announces the minimum length before any password is typed', async () => {
    render(<App />)
    await goToProfile()

    expect(
      await screen.findByText('Un mot de passe doit compter au moins 12 caractères.'),
    ).toBeDefined()
  })

  it('shows a live strength indicator as the new password is typed', async () => {
    render(<App />)
    await goToProfile()
    await screen.findByText('Un mot de passe doit compter au moins 12 caractères.')

    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'short' } })
    expect(await screen.findByText('Encore 7 caractère(s) nécessaire(s).')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'a much longer new passphrase' },
    })
    expect(await screen.findByText('Répond à la politique du site.')).toBeDefined()
  })
})

describe('my profile — accessibility', () => {
  it('has no serious accessibility violation', async () => {
    const { container } = render(<App />)
    await goToProfile()
    await screen.findByText(/Work laptop/u)

    await expectNoSeriousA11yViolations(container)
  })
})
