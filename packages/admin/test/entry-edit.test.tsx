import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToArticles(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Contenus' }))
  await screen.findByRole('heading', { name: 'Contenus' })
  fireEvent.click(screen.getByRole('link', { name: 'Articles' }))
  await screen.findByText('First article')
}

describe('editing an existing entry', () => {
  it('loads the entry, generates one field per schema field, and saves an edit', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    const title = screen.getByLabelText('title', { exact: false }) as HTMLInputElement
    expect(title.value).toBe('First article')

    fireEvent.change(title, { target: { value: 'Updated title' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Enregistré.')
  })

  it('opens the real site URL a preview token was minted for, in a new tab', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser' }))

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1))
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/blog/first-article?state=working&preview=preview-token-1',
      '_blank',
      'noopener',
    )
  })

  it('shows the server hint, not just the message, when preview fails for a missing signing key (fiche 40 task 1)', async () => {
    // The exact bug the user reported: `preview-token.ts` already carries a
    // `hint` telling the operator what to do and where — the admin was
    // reading only `caught.message` and throwing it away.
    installMockFetch({ previewSigningKeyMissing: true })
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(
      'Preview tokens need COGENTA_PREVIEW_SIGNING_KEY to hold at least 32 characters.',
    )
    expect(alert.textContent).toContain('openssl rand -hex 32')
  })

  it('reports a nonexistent entry rather than showing a blank form', async () => {
    // Direct navigation to an id the mock server does not have — no list
    // detour needed, since the point is what happens when the URL itself is
    // wrong (typed by hand, a stale bookmark).
    window.history.pushState(null, '', '/collections/article/does-not-exist')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
  })
})

/**
 * Status control and publication (the audit's top finding: the API route has
 * existed since L2, the admin never called it). Role gates are checked
 * server-side too — `packages/api/test/rest/publish-duplicate.test.ts` — this
 * file only proves the button does not even render for a role without the
 * permission, and that it calls the real route for one that has it.
 */
describe('status and publication', () => {
  it('shows the publish button and status selector to an editor, and publishes', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'Second article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    expect(screen.getByText('Brouillon')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Publier' }))

    expect(await screen.findByText('Statut changé en Publié.')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Publier' })).toBeNull()
  })

  it('moves a published entry back to draft through the status selector', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    fireEvent.change(screen.getByLabelText('Statut :'), { target: { value: 'draft' } })

    expect(await screen.findByText('Statut changé en Brouillon.')).toBeDefined()
  })

  it('hides the publish button and status selector from a role without publish', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['viewer'] })

    window.history.pushState(null, '', '/collections/article/entry-1')
    render(<App />)
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    expect(screen.queryByRole('button', { name: 'Publier' })).toBeNull()
    // The current status is still visible — just not editable.
    expect(screen.getByText('Publié')).toBeDefined()
    expect(screen.queryByLabelText('Statut :')).toBeNull()
  })
})

/**
 * Scheduling (task 1): `@cogenta/schema`'s queue-based scheduler is now
 * registered by `cogenta serve`, and this is its other half — a real
 * date/time picker, not a read-only badge, wired to
 * `POST .../unpublish {status: 'scheduled', publishedAt}` since `update()`
 * never changes `status`.
 */
describe('scheduling a future publication', () => {
  it('offers a real date/time picker and schedules the entry', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'Second article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    const picker = screen.getByLabelText('Publier le :')
    expect(picker.getAttribute('type')).toBe('datetime-local')

    fireEvent.change(picker, { target: { value: '2030-01-01T09:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Programmer' }))

    expect(await screen.findByText('Statut changé en Programmé.')).toBeDefined()
    expect(screen.getByText('Programmé')).toBeDefined()
    // Rescheduling and cancelling are now on offer, "Programmer" is not.
    expect(screen.getByRole('button', { name: 'Reprogrammer' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Annuler la programmation' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Programmer' })).toBeNull()
  })

  it('refuses to schedule with no date chosen', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'Second article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    fireEvent.click(screen.getByRole('button', { name: 'Programmer' }))

    expect(
      await screen.findByText('Choisissez une date et une heure de publication.'),
    ).toBeDefined()
  })

  it('cancels a schedule back to draft', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'Second article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    fireEvent.change(screen.getByLabelText('Publier le :'), {
      target: { value: '2030-01-01T09:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Programmer' }))
    await screen.findByText('Programmé')

    fireEvent.click(screen.getByRole('button', { name: 'Annuler la programmation' }))

    expect(await screen.findByText('Statut changé en Brouillon.')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Annuler la programmation' })).toBeNull()
  })
})

describe('duplicating an entry', () => {
  it('shows the duplicate button to a role that may create, and opens the new draft', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }))

    await waitFor(() => expect(window.location.pathname).toBe('/collections/article/entry-1-copy'))
    await screen.findByRole('heading', { name: 'Modifier : Article' })
    expect((screen.getByLabelText('title', { exact: false }) as HTMLInputElement).value).toBe(
      'First article',
    )
  })

  it('hides the duplicate button from a role without create', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['viewer'] })

    window.history.pushState(null, '', '/collections/article/entry-1')
    render(<App />)
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    expect(screen.queryByRole('button', { name: 'Dupliquer' })).toBeNull()
  })
})

/**
 * Regression: `assistFields` used to derive each field's name from
 * `Object.entries(collection.fields)` — correct for an object keyed by field
 * name, but `collection.fields` is really an array, so `Object.entries` handed
 * back array-index keys ("0", "1", ...) instead of the real field names. A
 * collection with more than one plain-text field (the article fixture's
 * `title` and `summary`, neither with an explicit `admin.label`, so the
 * fallback is the field's own name either way) showed that as a field picker
 * offering "0"/"1" instead of "title"/"summary", and picking the second
 * field found nothing at `values["1"]` — every assist tool stayed disabled
 * for a field that plainly has text.
 */
describe('the writing assistant field picker', () => {
  it('identifies each assist field by its real name, not by array position', async () => {
    installMockFetch({
      assistant: {
        available: true,
        tools: [
          {
            tool: 'assist.rewrite',
            label: 'Rewrite',
            description: 'Rewrite a passage.',
            cost: 'medium',
            needs: [],
          },
        ],
      },
    })

    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    const picker = await screen.findByLabelText('Quel champ ?')
    expect(screen.getByRole('option', { name: 'title' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'summary' })).toBeDefined()
    expect(screen.queryByRole('option', { name: '0' })).toBeNull()
    expect(screen.queryByRole('option', { name: '1' })).toBeNull()

    fireEvent.change(picker, { target: { value: 'summary' } })

    // The article fixture's `summary` really has text — with the bug, the
    // field picked under the name "1" read `values["1"]`, which is
    // `undefined`, so every tool stayed disabled.
    const rewrite = await screen.findByRole('button', { name: 'Rewrite' })
    expect((rewrite as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('multilingual editing', () => {
  it('lists the site locales, and starts a translation seeded from the source entry', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ siteLocales: ['en', 'fr'] })

    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    await screen.findByRole('heading', { name: 'Traductions' })
    expect(screen.getByText('en (courant)')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'fr — créer la traduction' }))
    await screen.findByRole('heading', { name: 'Nouveau : Article' })

    expect(screen.getByText('fr')).toBeDefined()
    expect(screen.getByText('(nouvelle traduction)', { exact: false })).toBeDefined()
    expect((screen.getByLabelText('title', { exact: false }) as HTMLInputElement).value).toBe(
      'First article',
    )
  })
})

describe('the "Assistant" and "Traductions" accordions when their feature is off (L20 audit point 16)', () => {
  it('shows a fallback message instead of an empty panel, with no AI provider and one locale', async () => {
    // The default `installMockFetch()` from `beforeEach`: no `assistant`
    // option means `available: false`, and no `siteLocales` option means a
    // single (or absent) locale — both accordions have nothing real to show.
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    await screen.findByText(
      "Aucun fournisseur LLM n'est configuré sur ce site : l'assistant d'écriture n'est pas disponible. Tout le reste de cet écran fonctionne sans lui.",
    )
    expect(
      screen.getByText(
        "Ce site n'a qu'une seule langue configurée : il n'y a pas de traduction à gérer ici.",
      ),
    ).toBeDefined()
  })

  it('shows the real assistant and translation switcher instead, once both are actually available', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      siteLocales: ['en', 'fr'],
      assistant: {
        available: true,
        tools: [
          {
            tool: 'assist.rewrite',
            label: 'Rewrite',
            description: 'Rewrite a passage.',
            cost: 'medium',
            needs: [],
          },
        ],
      },
    })

    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })

    await screen.findByRole('button', { name: 'Rewrite' })
    expect(
      screen.queryByText(
        "Aucun fournisseur LLM n'est configuré sur ce site : l'assistant d'écriture n'est pas disponible. Tout le reste de cet écran fonctionne sans lui.",
      ),
    ).toBeNull()

    await screen.findByRole('heading', { name: 'Traductions' })
    expect(
      screen.queryByText(
        "Ce site n'a qu'une seule langue configurée : il n'y a pas de traduction à gérer ici.",
      ),
    ).toBeNull()
  })
})

describe('creating a new entry', () => {
  it('shows the "Nouveau" link for a role that can create, and lands on the new entry after saving', async () => {
    render(<App />)
    await goToArticles()

    fireEvent.click(screen.getByRole('link', { name: 'Nouveau' }))
    await screen.findByRole('heading', { name: 'Nouveau : Article' })

    fireEvent.change(screen.getByLabelText('title', { exact: false }), {
      target: { value: 'Brand new article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Modifier : Article' })).toBeDefined(),
    )
  })
})

/**
 * Autosave (L13 task 5). What these prove is as much about what does *not*
 * happen: an autosave never reaches `PATCH /api/content/...`, so it never
 * writes a version row, so `history()` keeps meaning exactly what it means
 * today — every row in it is a save a human asked for.
 */
describe('autosaving a draft in progress', () => {
  const AUTOSAVE_KEY = 'cogenta.autosave.article.entry-1.en'

  function patchCallCount(): number {
    return vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH').length
  }

  async function openFirstArticle(): Promise<void> {
    render(<App />)
    await goToArticles()
    fireEvent.click(screen.getByRole('link', { name: 'First article' }))
    await screen.findByRole('heading', { name: 'Modifier : Article' })
  }

  function seedAutosave(at: string, title: string): void {
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ format: 1, at, values: { title }, blocks: {} }),
    )
  }

  it('keeps the draft in this browser on a timer, and sends nothing to the server', async () => {
    // Only `setInterval`/`Date` are faked, not `setTimeout`: the sidebar's
    // "Contenus" entry only appears once the schema has loaded (fiche 35's
    // role/feature-gated nav), and whatever real timer that resolution rides
    // on needs to keep ticking for `openFirstArticle` below to find it.
    // `useAutosave`'s own timer is a real `setInterval`, so faking just that
    // still lets `advanceTimersByTimeAsync` below skip the wait.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    try {
      await openFirstArticle()

      fireEvent.change(screen.getByLabelText('title', { exact: false }), {
        target: { value: 'Half a sentence' },
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000)
      })

      const stored = localStorage.getItem(AUTOSAVE_KEY)
      expect(stored).not.toBeNull()
      expect((JSON.parse(stored as string) as { values: { title: string } }).values.title).toBe(
        'Half a sentence',
      )
      // The whole point: no version was written, because no request was sent.
      expect(patchCallCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops the local copy once the entry is really saved', async () => {
    // Same narrowed fake-timer set as the previous test, same reason.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    try {
      await openFirstArticle()

      fireEvent.change(screen.getByLabelText('title', { exact: false }), {
        target: { value: 'Half a sentence' },
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000)
      })
      expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
      await screen.findByRole('status')

      expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull()
      expect(patchCallCount()).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('offers a newer local draft back, and applies it only when asked', async () => {
    // The mock entry was last saved on 2026-02-01.
    seedAutosave('2026-03-01T12:00:00.000Z', 'Recovered from a crashed tab')
    await openFirstArticle()

    // Never applied on its own — what the server holds is still what is shown.
    expect((screen.getByLabelText('title', { exact: false }) as HTMLInputElement).value).toBe(
      'First article',
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Les restaurer' }))
    expect((screen.getByLabelText('title', { exact: false }) as HTMLInputElement).value).toBe(
      'Recovered from a crashed tab',
    )
  })

  it('forgets a local draft the editor discards', async () => {
    seedAutosave('2026-03-01T12:00:00.000Z', 'Not wanted')
    await openFirstArticle()

    fireEvent.click(await screen.findByRole('button', { name: 'Les abandonner' }))

    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Les restaurer' })).toBeNull()
  })

  it('says nothing about a local draft older than the last real save', async () => {
    // Before the entry's 2026-02-01 updatedAt: it is already in the entry.
    seedAutosave('2026-01-15T12:00:00.000Z', 'Stale')
    await openFirstArticle()

    expect(screen.queryByRole('button', { name: 'Les restaurer' })).toBeNull()
  })
})
