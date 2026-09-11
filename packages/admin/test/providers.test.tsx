import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { expectNoSeriousA11yViolations } from './helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToProviders(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(screen.getByRole('link', { name: 'Fournisseurs' }))
  await screen.findByRole('heading', { name: 'Fournisseurs' })
}

describe('providers', () => {
  it('refuses to show anything to a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    window.history.pushState(null, '', '/providers')

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
  })

  it('saves a provider, never showing the key back, then can disable and remove it', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()

    expect(await screen.findByText(/Aucun fournisseur configuré/)).toBeDefined()

    fireEvent.change(screen.getByPlaceholderText('Plus jamais affichée une fois enregistrée'), {
      target: { value: 'sk-ant-secret-value' },
    })
    fireEvent.change(screen.getByPlaceholderText('ex. claude-sonnet-4'), {
      target: { value: 'claude-sonnet' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('••••alue')).toBeDefined()
    expect(screen.queryByText(/secret-value/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }))
    expect(await screen.findByText('Désactivé')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))
    expect(await screen.findByText(/Aucun fournisseur configuré/)).toBeDefined()
  })

  it('the model select fills the free-text model field for the selected provider', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()
    await screen.findByText(/Aucun fournisseur configuré/)

    fireEvent.change(screen.getByLabelText('Modèle connu'), {
      target: { value: 'claude-sonnet-5' },
    })

    expect(screen.getByPlaceholderText('ex. claude-sonnet-4')).toHaveProperty(
      'value',
      'claude-sonnet-5',
    )
  })

  it('saves per-provider model tuning (max output tokens, timeout, correction attempts) and shows it back in the table', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()
    await screen.findByText(/Aucun fournisseur configuré/)

    fireEvent.change(screen.getByPlaceholderText('Plus jamais affichée une fois enregistrée'), {
      target: { value: 'sk-deepseek-secret' },
    })
    fireEvent.change(screen.getByPlaceholderText('ex. claude-sonnet-4'), {
      target: { value: 'deepseek-v4-flash' },
    })
    fireEvent.change(screen.getByLabelText('Tokens de sortie max'), {
      target: { value: '12000' },
    })
    fireEvent.change(screen.getByLabelText("Délai d'attente (secondes)"), {
      target: { value: '240' },
    })
    fireEvent.change(screen.getByLabelText('Tentatives de correction max'), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('12000 tokens · 240s · 5 essais')).toBeDefined()
  })

  it('leaves model tuning unset when the fields are left blank — shows "Par défaut"', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()
    await screen.findByText(/Aucun fournisseur configuré/)

    fireEvent.change(screen.getByPlaceholderText('Plus jamais affichée une fois enregistrée'), {
      target: { value: 'sk-ant-secret-value' },
    })
    fireEvent.change(screen.getByPlaceholderText('ex. claude-sonnet-4'), {
      target: { value: 'claude-sonnet' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Par défaut')).toBeDefined()
  })

  // fiche feedback: a saved provider's row had no way to change its own
  // model/baseUrl/tuning without re-pasting the API key — "Modifier" opens
  // a dialog that goes through PATCH instead, never re-asking for the key.
  it('edits an existing provider’s tuning without re-entering the API key', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()
    await screen.findByText(/Aucun fournisseur configuré/)

    fireEvent.change(screen.getByPlaceholderText('Plus jamais affichée une fois enregistrée'), {
      target: { value: 'sk-ant-secret-value' },
    })
    fireEvent.change(screen.getByPlaceholderText('ex. claude-sonnet-4'), {
      target: { value: 'claude-sonnet' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByText('••••alue')

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    const dialog = await screen.findByRole('dialog', { name: /Modifier —/ })
    // The dialog never asks for the API key at all.
    expect(
      within(dialog).queryByPlaceholderText('Plus jamais affichée une fois enregistrée'),
    ).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Tokens de sortie max'), {
      target: { value: '20000' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('20000 tokens')).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('refuses to edit a provider’s settings for a role below admin', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['editor'] })
    window.history.pushState(null, '', '/providers')

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('admin'),
    )
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
  })

  it('a custom provider (fiche 56) requires a baseUrl and saves under its own id', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()
    await screen.findByText(/Aucun fournisseur configuré/)

    fireEvent.change(screen.getByLabelText('Fournisseur'), { target: { value: '__custom__' } })
    fireEvent.change(screen.getByLabelText('Identifiant du fournisseur'), {
      target: { value: 'my-vllm-server' },
    })
    fireEvent.change(screen.getByPlaceholderText('Plus jamais affichée une fois enregistrée'), {
      target: { value: 'sk-local-secret' },
    })
    fireEvent.change(screen.getByPlaceholderText('ex. claude-sonnet-4'), {
      target: { value: 'llama-3' },
    })

    // No baseUrl yet: a custom provider cannot resolve to a client, so Save
    // stays disabled rather than letting the request fail server-side.
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveProperty('disabled', true)

    fireEvent.change(screen.getByLabelText('URL de base'), {
      target: { value: 'https://vllm.internal/v1/chat/completions' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('my-vllm-server')).toBeDefined()
  })
})

// A multimodal vendor is ONE entry sharing ONE API key: the "can render
// images" capability is derived from an image model being named, never stored
// as a separate flag — so these tests only ever fill in (or empty) a model
// field, and never look for a checkbox.
describe('providers — image model', () => {
  it('shows "Texte seulement" for a provider saved without an image model', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()
    await screen.findByText(/Aucun fournisseur configuré/)

    fireEvent.change(screen.getByPlaceholderText('Plus jamais affichée une fois enregistrée'), {
      target: { value: 'sk-ant-secret-value' },
    })
    fireEvent.change(screen.getByPlaceholderText('ex. claude-sonnet-4'), {
      target: { value: 'claude-sonnet' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Texte seulement')).toBeDefined()
  })

  it('saves an image model on a multimodal provider and shows the capability in the table', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()
    await screen.findByText(/Aucun fournisseur configuré/)

    fireEvent.change(screen.getByLabelText('Fournisseur'), { target: { value: 'openai' } })
    fireEvent.change(screen.getByPlaceholderText('Plus jamais affichée une fois enregistrée'), {
      target: { value: 'sk-openai-secret' },
    })
    fireEvent.change(screen.getByPlaceholderText('ex. claude-sonnet-4'), {
      target: { value: 'gpt-5' },
    })

    // The image endpoint is secondary: it means nothing until a model names
    // what would be rendered, so it stays hidden until then.
    expect(screen.queryByLabelText("Point d'accès image")).toBeNull()
    fireEvent.change(screen.getByLabelText("Modèle d'image"), {
      target: { value: 'gpt-image-1' },
    })
    expect(screen.getByLabelText("Point d'accès image")).toBeDefined()
    // Naming a model on a vendor that really does images warns about nothing.
    expect(screen.queryByText(/ne sait pas générer d'images/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('gpt-image-1')).toBeDefined()
    expect(screen.queryByText('Texte seulement')).toBeNull()
  })

  it('warns that an image model on a text-only vendor will be ignored, without blocking the save', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()
    await screen.findByText(/Aucun fournisseur configuré/)

    // anthropic is the first catalog entry, and has no image client server-side.
    fireEvent.change(screen.getByPlaceholderText('Plus jamais affichée une fois enregistrée'), {
      target: { value: 'sk-ant-secret-value' },
    })
    fireEvent.change(screen.getByPlaceholderText('ex. claude-sonnet-4'), {
      target: { value: 'claude-sonnet' },
    })
    fireEvent.change(screen.getByLabelText("Modèle d'image"), {
      target: { value: 'some-image-model' },
    })

    expect(screen.getByText(/« anthropic » ne sait pas générer d'images/)).toBeDefined()
    // The server, not this screen, decides: the save stays available.
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveProperty('disabled', false)
  })

  it('emptying the image model in the edit dialog takes the capability back', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({
      roles: ['admin'],
      providers: [
        {
          provider: 'openai',
          enabled: true,
          model: 'gpt-5',
          maskedKey: '••••cdef',
          updatedAt: '2026-03-01T00:00:00.000Z',
          imageModel: 'gpt-image-1',
          imageBaseUrl: 'https://proxy.internal/v1/images/generations',
        },
      ],
    })

    render(<App />)
    await goToProviders()
    await screen.findByText('gpt-image-1')

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    const dialog = await screen.findByRole('dialog', { name: /Modifier —/ })
    expect(within(dialog).getByLabelText("Modèle d'image")).toHaveProperty('value', 'gpt-image-1')

    fireEvent.change(within(dialog).getByLabelText("Modèle d'image"), { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Texte seulement')).toBeDefined()
    expect(screen.queryByText('gpt-image-1')).toBeNull()
  })

  it('has no serious accessibility violation with the image fields and their warning on screen', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    const { container } = render(<App />)
    await goToProviders()
    await screen.findByText(/Aucun fournisseur configuré/)

    fireEvent.change(screen.getByLabelText("Modèle d'image"), {
      target: { value: 'some-image-model' },
    })
    await screen.findByText(/ne sait pas générer d'images/)

    await expectNoSeriousA11yViolations(container)
  })
})

// fiche feedback: the site-wide LLM tuning floor (`assistant.default*`) used
// to be invisible TypeScript constants, only ever mentioned as static hint
// text naming a literal number. It is now a real site setting, rendered
// generically (`SiteSettingsField`) in its own card above the provider list.
describe('providers — "Réglages par défaut" card', () => {
  it('shows the site-wide tuning floor, pre-filled from the real registry default', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()

    const card = await screen.findByRole('region', { name: 'Réglages par défaut' })
    expect(within(card).getByLabelText('Tokens de sortie max — défaut du site')).toHaveProperty(
      'value',
      '8000',
    )
    expect(
      within(card).getByLabelText("Délai d'attente — défaut du site (secondes)"),
    ).toHaveProperty('value', '180')
    expect(
      within(card).getByLabelText('Tentatives de correction max — défaut du site'),
    ).toHaveProperty('value', '3')
  })

  it('writes a changed default on blur, distinct from any one provider’s own override', async () => {
    localStorage.clear()
    localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
    installMockFetch({ roles: ['admin'] })

    render(<App />)
    await goToProviders()

    const card = await screen.findByRole('region', { name: 'Réglages par défaut' })
    const field = within(card).getByLabelText('Tokens de sortie max — défaut du site')
    fireEvent.change(field, { target: { value: '12000' } })
    fireEvent.blur(field)

    // Two "Enregistré." indicators legitimately coexist in this card once
    // committed — the field's own inline status and the card-level one in
    // its footer — so this waits on the write itself rather than picking
    // between them.
    await waitFor(() => {
      expect(within(card).getAllByText('Enregistré.').length).toBeGreaterThan(0)
    })
    expect(field).toHaveProperty('value', '12000')
  })
})
