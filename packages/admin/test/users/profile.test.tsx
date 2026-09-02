import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { i18next } from '../../src/i18n/index.js'
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

afterEach(async () => {
  vi.unstubAllGlobals()
  // The public-profile "language" field (fiche 17 task 3) calls the real,
  // shared `setLanguage`, which is a module-level singleton — left at 'en'
  // it would silently translate every French assertion in every test that
  // runs after it, in this file and beyond.
  await i18next.changeLanguage('fr')
  localStorage.removeItem('cogenta.admin.language')
})

async function goToProfile(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Mon profil' }))
  await screen.findByRole('heading', { name: 'Mon profil' })
}

describe('my profile — password', () => {
  it('keeps the password fields hidden behind a button until clicked (fiche 40-adjacent)', async () => {
    render(<App />)
    await goToProfile()

    expect(screen.queryByLabelText('Mot de passe actuel')).toBeNull()
    expect(screen.getByRole('button', { name: 'Changer le mot de passe' })).toBeDefined()
  })

  it('changes the password when the current one is right, then collapses the form back', async () => {
    render(<App />)
    await goToProfile()

    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
      target: { value: 'correct horse battery staple' },
    })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'a much longer new passphrase' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le changement' }))

    expect(await screen.findByText('Mot de passe modifié.')).toBeDefined()
    // The form closes itself once the change succeeds — nothing left open
    // for someone glancing at the screen after the fact.
    expect(screen.queryByLabelText('Mot de passe actuel')).toBeNull()
  })

  it('reports the server refusing a wrong current password, without pretending it worked', async () => {
    render(<App />)
    await goToProfile()

    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
      target: { value: 'not it' },
    })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'a much longer new passphrase' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le changement' }))

    expect(await screen.findByText('The current password is not correct.')).toBeDefined()
    expect(screen.queryByText('Mot de passe modifié.')).toBeNull()
  })

  it('cancel closes the form without submitting', async () => {
    render(<App />)
    await goToProfile()

    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
      target: { value: 'correct horse battery staple' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByLabelText('Mot de passe actuel')).toBeNull()
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

/**
 * Fiche 17 task 3 — self-service public profile. The avatar picker is not
 * exercised here: it reuses the same `listMedia`/`getMedia` calls
 * `fields/media-field.tsx` already does, and this suite's mock has no media
 * fixtures wired in (that is fiche 11's screen) — clicking it would hit
 * `mock-fetch.ts`'s "unhandled request" guard rather than prove anything
 * about fiche 17.
 */
describe('my profile — public profile', () => {
  it('saves the display name and bio', async () => {
    render(<App />)
    await goToProfile()
    // Waits for the profile fetch to actually resolve before touching the
    // form: the field-seeding effect is keyed on the loaded account's id, and
    // firing a change before it settles would have that effect overwrite
    // whatever was just typed the moment the fetch finally completes.
    await screen.findByText(/Work laptop/u)

    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: 'Alice A.' } })
    fireEvent.change(screen.getByLabelText('Biographie courte'), {
      target: { value: 'Écrit des articles.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le profil' }))

    expect(await screen.findByText('Profil enregistré.')).toBeDefined()
  })

  it('changing the interface language takes effect in this browser immediately', async () => {
    render(<App />)
    await goToProfile()
    await screen.findByText(/Work laptop/u)

    fireEvent.change(screen.getByLabelText("Langue de l'interface"), {
      target: { value: 'en' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le profil' }))

    // The rest of this very page re-renders in the new language the moment
    // it applies — proof the account-level preference (fiche 17 task 3) is
    // wired to the same `setLanguage` ADR-0019 already uses, not just saved
    // silently to the server.
    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeDefined()
    expect(localStorage.getItem('cogenta.admin.language')).toBe('en')
  })

  it('says the fields are publishable, before any of them are filled in', async () => {
    render(<App />)
    await goToProfile()

    expect(
      screen.getByText(/peuvent devenir visibles par d'autres personnes utilisant ce site/u),
    ).toBeDefined()
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
    // Human-readable labels, not raw audit action codes (the user flagged
    // this directly — "content.publish"/"site_setting.update" reading in
    // full in the activity feed).
    expect(await screen.findByText('Mot de passe changé')).toBeDefined()
    expect(screen.getByText('Connexion')).toBeDefined()
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
    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))

    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'short' } })
    expect(await screen.findByText('Encore 7 caractère(s) nécessaire(s).')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'a much longer new passphrase' },
    })
    expect(await screen.findByText('Répond à la politique du site.')).toBeDefined()
  })
})

/**
 * Fiche 35 audit T04 — `getChannelPreferences`/`setChannelPreferences`
 * (`notices-client.ts`) existed since fiche 38 with no screen ever calling
 * them. `channels.tsx` (the linking screen) deliberately left this out of
 * its own scope — this is that screen, on `profile.tsx`.
 */
describe('my profile — notification preferences', () => {
  it('explains there is nothing to configure yet when no channel is linked', async () => {
    render(<App />)
    await goToProfile()

    expect(
      await screen.findByText(
        "Aucun canal lié pour le moment. Liez un compte Telegram, Slack ou Discord depuis l'écran Canaux pour choisir ce qu'il reçoit.",
      ),
    ).toBeDefined()
  })

  it('loads a linked channel’s real preferences, changes them, and saves through the real route', async () => {
    installMockFetch({
      linkedChannels: [
        {
          channelName: 'telegram',
          channelUserId: 'tg-user-1',
          linkedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      channelPreferences: {
        telegram: { minSeverity: 'info', grouping: 'immediate', quietHours: null },
      },
    })
    const first = render(<App />)
    await goToProfile()

    const severity = (await screen.findByLabelText('Gravité minimale reçue')) as HTMLSelectElement
    expect(severity.value).toBe('info')

    fireEvent.change(severity, { target: { value: 'critical' } })
    fireEvent.change(screen.getByLabelText('Regroupement'), { target: { value: 'daily' } })
    fireEvent.click(screen.getByLabelText('Heures calmes'))
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '22:00' } })
    fireEvent.change(screen.getByLabelText('À'), { target: { value: '07:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Enregistré.')).toBeDefined()
    first.unmount()
    // `BrowserRouter` reads real `window.history`, left at `/profile` by
    // the first render above — reset it the same way `setup.ts`'s own
    // `afterEach` does, so the second render starts fresh at the dashboard.
    window.history.pushState(null, '', '/')

    // Reloading the screen proves the write actually landed server-side,
    // not just in this component's own local state.
    const { unmount } = render(<App />)
    await goToProfile()
    expect(
      (await screen.findByLabelText('Gravité minimale reçue')) as HTMLSelectElement,
    ).toHaveProperty('value', 'critical')
    expect(screen.getByLabelText('Regroupement')).toHaveProperty('value', 'daily')
    expect(screen.getByLabelText('De')).toHaveProperty('value', '22:00')
    expect(screen.getByLabelText('À')).toHaveProperty('value', '07:00')
    unmount()
  })

  it('only ever reads and writes this signed-in account’s own preferences (no id in any call)', async () => {
    installMockFetch({
      linkedChannels: [
        {
          channelName: 'slack',
          channelUserId: 'slack-user-1',
          linkedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
    })
    const fetchSpy = vi.fn(globalThis.fetch)
    vi.stubGlobal('fetch', fetchSpy)

    render(<App />)
    await goToProfile()
    await screen.findByLabelText('Gravité minimale reçue')

    // Every request this screen makes for preferences names the channel
    // type only (`telegram`/`slack`/`discord`) — never a user id — because
    // the server resolves "whose preferences" from the bearer token, the
    // same way every other route on this page already does.
    const preferenceCalls = fetchSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/preferences'))
    expect(preferenceCalls.length).toBeGreaterThan(0)
    for (const url of preferenceCalls) {
      expect(url).toContain('/api/notices/channels/slack/preferences')
    }
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
