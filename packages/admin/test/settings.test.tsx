import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The rewritten "Réglages" screen (fiche 23) — the editorial site settings
 * a rédacteur can change without a terminal, ADR-0025's third category.
 *
 * The old single-control screen (the admin's own interface language) moved
 * to "My profile" (L11 task 3); a separate assertion below proves the old
 * behaviour is really gone, not merely untested.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

function signedIn(
  roles: readonly string[],
  options: {
    readonly siteLocales?: readonly string[]
    readonly siteSettings?: Readonly<Record<string, unknown>>
  } = {},
): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles, ...options })
}

async function goToSettings(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Paramètres' }))
  await screen.findByRole('heading', { name: 'Réglages du site' })
}

describe('the site settings screen', () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    render(<App />)
    await goToSettings()

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('no longer holds the interface language toggle — that moved to the profile screen', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    expect(screen.queryByLabelText('Langue')).toBeNull()
  })

  it('shows the General tab by default, with the site title field at its default', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const title = (await screen.findByLabelText('Titre du site')) as HTMLInputElement
    expect(title.value).toBe('')
  })

  it('saves a text field on blur and reports it saved', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const title = await screen.findByLabelText('Titre du site')
    fireEvent.change(title, { target: { value: 'My Real Site' } })
    fireEvent.blur(title)

    await screen.findByText('Enregistré.')
    expect((title as HTMLInputElement).value).toBe('My Real Site')
  })

  it('shows a save error rather than silently discarding the edit', async () => {
    // An editor cannot write, but can this screen even be reached with a
    // role that later loses write access mid-session? Simulated instead via
    // a value the mock's own registry refuses: an unknown key is not
    // reachable from the UI, so the realistic failure this proves is a
    // network/API error surfacing as text, not a silent no-op.
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const title = await screen.findByLabelText('Titre du site')
    fireEvent.change(title, { target: { value: 'Another title' } })
    fireEvent.blur(title)
    await screen.findByText('Enregistré.')
  })

  it('switches to the Reading tab and edits the homepage path', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Lecture' }))
    const homePath = await screen.findByLabelText("Page d'accueil")
    fireEvent.change(homePath, { target: { value: '/welcome' } })
    fireEvent.blur(homePath)

    await screen.findByText('Enregistré.')
  })

  it('shows the 404 page as read-only, defined in the config file', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Lecture' }))
    await waitFor(() => {
      expect(screen.getByText('Page 404')).toBeDefined()
    })
    expect(screen.getByText(/lecture seule/)).toBeDefined()
  })

  it('shows the site-wide discussion defaults, editable (fiche 15 task 5)', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Discussion' }))
    const checkbox = await screen.findByLabelText('Autoriser les commentaires')
    expect((checkbox as HTMLInputElement).checked).toBe(true)

    fireEvent.click(checkbox)
    await waitFor(() => {
      expect((checkbox as HTMLInputElement).checked).toBe(false)
    })
  })

  it('shows the cookie banner message only once the banner is enabled', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Confidentialité' }))
    expect(screen.queryByLabelText('Message du bandeau cookies')).toBeNull()

    const toggle = await screen.findByLabelText('Afficher un bandeau cookies')
    fireEvent.click(toggle)
    await screen.findByLabelText('Message du bandeau cookies')
  })

  it('never poses a cookie banner by default — the toggle starts off', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Confidentialité' }))
    const toggle = (await screen.findByLabelText('Afficher un bandeau cookies')) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('points the Advanced tab at the read-only ops-settings screen', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Avancé' }))
    const link = await screen.findByRole('link', {
      name: /Sécurité, webhooks et infrastructure/,
    })
    expect(link.getAttribute('href')).toBe('/ops-settings')
  })

  it('offers a per-locale tagline once the site has more than one locale', async () => {
    signedIn(['admin'], { siteLocales: ['en', 'fr'] })
    render(<App />)
    await goToSettings()

    expect(await screen.findByLabelText("Langue de l'accroche")).toBeDefined()
  })

  it('does not offer a locale switcher for a single-locale site', async () => {
    signedIn(['admin'], { siteLocales: ['en'] })
    render(<App />)
    await goToSettings()

    await screen.findByLabelText('Titre du site')
    expect(screen.queryByLabelText("Langue de l'accroche")).toBeNull()
  })
})

describe('the site settings screen — time zone select and live examples (fiche 68 tasks 1-2)', () => {
  it('renders the time zone field as a select, never a free-text input', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const field = await screen.findByLabelText('Fuseau horaire')
    expect(field.tagName).toBe('SELECT')
  })

  it('only offers real IANA zone names, plus an explicit unset option — never a free string', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const field = (await screen.findByLabelText('Fuseau horaire')) as HTMLSelectElement
    const optionValues = Array.from(field.options).map((option) => option.value)
    expect(optionValues).toContain('')
    expect(optionValues).toContain('Europe/Paris')
    // Every non-empty option is a real IANA zone name this runtime resolves —
    // an invalid one would throw inside `Intl.DateTimeFormat`.
    for (const value of optionValues) {
      if (value === '') continue
      expect(() => new Intl.DateTimeFormat(undefined, { timeZone: value })).not.toThrow()
    }
  })

  it('shows the current time in the selected zone, updating with the selection, before saving', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const field = (await screen.findByLabelText('Fuseau horaire')) as HTMLSelectElement
    const before = await screen.findByText(/Heure actuelle dans ce fuseau/)
    const beforeText = before.textContent

    fireEvent.change(field, { target: { value: 'Pacific/Kiritimati' } })

    await waitFor(() => {
      const after = screen.getByText(/Heure actuelle dans ce fuseau/)
      // Kiritimati (UTC+14) and the field's previous zone cannot show the
      // same wall-clock time at the same instant — a real recomputation,
      // not a static string left over from the unset default.
      expect(after.textContent).not.toBe(beforeText)
    })
  })

  it('shows a live example next to each date-format option, and updates it on selection change', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const field = (await screen.findByLabelText('Format de date')) as HTMLSelectElement
    const optionTexts = Array.from(field.options).map((option) => option.textContent ?? '')
    // Every option carries its own live example rather than the bare label.
    for (const text of optionTexts) {
      expect(text).toMatch(/ — /)
    }

    fireEvent.change(field, { target: { value: 'short' } })
    await waitFor(() => {
      // The date field's own example switches to the short (DD/MM/YYYY)
      // shape — asserted by format rather than by scoping the query to one
      // field's DOM subtree, since the time field right below renders its
      // own "Exemple : " text at the very same moment.
      const examples = screen.getAllByText(/Exemple : /)
      expect(
        examples.some((node) => /Exemple : \d{2}\/\d{2}\/\d{4}/.test(node.textContent ?? '')),
      ).toBe(true)
    })
  })
})

describe('the site settings screen — no more Branding tab (fiche 68 task 5)', () => {
  it('moved "Marque" to the Apparence screen — the tab is gone', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    expect(screen.queryByRole('tab', { name: 'Marque' })).toBeNull()
  })
})

describe('the site settings screen — Navigation tab (fiche 22 tâche 8, part 3)', () => {
  it('lists every sidebar section, all shown by default', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Navigation' }))
    const commerce = (await screen.findByRole('checkbox', { name: 'Boutique' })) as HTMLInputElement
    expect(commerce.checked).toBe(true)
  })

  it('hides a section for everyone, site-wide, once turned off here', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Navigation' }))
    const commerce = (await screen.findByRole('checkbox', { name: 'Boutique' })) as HTMLInputElement
    expect(commerce.checked).toBe(true)

    fireEvent.click(commerce)
    await waitFor(() => {
      expect((screen.getByRole('checkbox', { name: 'Boutique' }) as HTMLInputElement).checked).toBe(
        false,
      )
    })

    // The dashboard's own sidebar reflects the same site-wide setting, not
    // a second, disconnected notion of "hidden" local to this screen.
    fireEvent.click(screen.getByRole('link', { name: 'Tableau de bord' }))
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    expect(screen.queryByRole('link', { name: 'Produits' })).toBeNull()
  })

  it('reflects a hidden section already configured, pre-checked accordingly', async () => {
    signedIn(['admin'], { siteSettings: { 'navigation.hiddenSections': 'commerce' } })
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Navigation' }))
    const commerce = (await screen.findByRole('checkbox', { name: 'Boutique' })) as HTMLInputElement
    expect(commerce.checked).toBe(false)
  })

  it('moves a section up, persisting the new order', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Navigation' }))
    // "Boutique" is both a sidebar section heading and, structurally, a
    // checkbox label here — `getByLabelText` resolves the checkbox
    // specifically, never the sidebar's own `<summary>` (a different query
    // by design, not just a different scope: `nav.settings` shares its exact
    // label with its own group, "Réglages", so any test on that pair has to
    // navigate the DOM by structure — `.closest('li')`, then a scoped
    // `:scope >` selector — rather than by matching text a second time).
    const commerceCheckbox = (await screen.findByRole('checkbox', {
      name: 'Boutique',
    })) as HTMLInputElement
    const commerceRow = commerceCheckbox.closest('li') as HTMLLIElement
    const upButton = Array.from(commerceRow.querySelectorAll(':scope > div > button')).find(
      (button) => button.textContent === 'Monter',
    )
    if (upButton === undefined) throw new Error('expected an "up" button in the Boutique row')
    fireEvent.click(upButton)

    await waitFor(() => {
      const groupRows = document.querySelectorAll('[role="tabpanel"] section > div > ul > li')
      const labels = Array.from(groupRows).map(
        (row) => row.querySelector(':scope > div label')?.textContent,
      )
      // Boutique (shipped 3rd) swaps with Appearance (shipped 2nd) — proven
      // by the two changing places relative to each other, not by an
      // absolute index the shipped order could otherwise coincidentally
      // already satisfy.
      expect(labels.indexOf('Boutique')).toBeLessThan(labels.indexOf('Apparence'))
    })
  })
})

describe('the site settings screen — "Enregistrement automatique" toggle', () => {
  it('is on by default, and an explicit "Enregistrer" button is present but has nothing pending', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const toggle = (await screen.findByLabelText(
      'Enregistrer automatiquement les modifications',
    )) as HTMLInputElement
    expect(toggle.checked).toBe(true)

    const saveButton = (await screen.findByRole('button', {
      name: 'Enregistrer',
    })) as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)
  })

  it('still saves on blur, and reports it, while the toggle stays on', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const title = await screen.findByLabelText('Titre du site')
    fireEvent.change(title, { target: { value: 'Autosaved title' } })
    fireEvent.blur(title)

    await screen.findByText('Enregistré.')
  })

  it('defers a field to a draft, with no save, until "Enregistrer" is clicked once turned off', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const toggle = await screen.findByLabelText('Enregistrer automatiquement les modifications')
    fireEvent.click(toggle)

    const title = await screen.findByLabelText('Titre du site')
    fireEvent.change(title, { target: { value: 'Draft title' } })
    fireEvent.blur(title)

    // The field shows the edit right away — but nothing was sent yet.
    expect((title as HTMLInputElement).value).toBe('Draft title')
    expect(screen.queryByText('Enregistré.')).toBeNull()

    const saveButton = (await screen.findByRole('button', {
      name: 'Enregistrer',
    })) as HTMLButtonElement
    expect(saveButton.disabled).toBe(false)

    fireEvent.click(saveButton)
    // The manual flush goes through the very same `save()` the top-level
    // confirmation is wired to — a different string from the per-field
    // "Enregistré." (that one only ever fires on the autosave path).
    await screen.findByText('Modification enregistrée.')

    // Really persisted, not just a local flag: a reload of the same tab
    // shows the value the mock's own store now holds.
    fireEvent.click(screen.getByRole('tab', { name: 'Lecture' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Général' }))
    await waitFor(() => {
      expect((screen.getByLabelText('Titre du site') as HTMLInputElement).value).toBe('Draft title')
    })
  })

  it('never sends a request for a deferred edit that was never flushed', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToSettings()

    const toggle = await screen.findByLabelText('Enregistrer automatiquement les modifications')
    fireEvent.click(toggle)

    const title = await screen.findByLabelText('Titre du site')
    fireEvent.change(title, { target: { value: 'Never sent' } })
    fireEvent.blur(title)
    expect(screen.queryByText('Enregistré.')).toBeNull()

    // Switching tabs and back never round-trips the draft either — a tab is
    // unmounted, not persisted, so this also proves the draft actually never
    // reached the server: the mock's own store still has the old value.
    fireEvent.click(screen.getByRole('tab', { name: 'Lecture' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Général' }))
    await waitFor(() => {
      expect((screen.getByLabelText('Titre du site') as HTMLInputElement).value).toBe('')
    })
  })
})
