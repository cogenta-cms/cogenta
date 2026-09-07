import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

// jsdom (this suite's environment) has never implemented
// `Blob.prototype.arrayBuffer`/`File.prototype.arrayBuffer` — a real browser
// has, and `toZipBase64` (`theme-sandbox-client.ts`) is written against that
// real API, the same technique `toGenerateThemeAttachment` already uses
// elsewhere in this codebase. `FileReader.readAsArrayBuffer`, unlike
// `arrayBuffer()`, *is* implemented here, so this polyfill lets the import
// test below exercise the real client function end to end rather than
// mocking it away.
if (typeof File.prototype.arrayBuffer !== 'function') {
  File.prototype.arrayBuffer = function arrayBuffer(this: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

/**
 * Fiche 73's own admin screen — the last, deliberately deferred piece of
 * every one of the fiche's 8 tasks. Every assertion here goes through the
 * mocked `/api/theme/sandbox`/`/api/theme/:name/versions`/`/api/theme/:name
 * /export`/`/api/theme/import` surface, the same discipline
 * `theme-generator.test.tsx` already follows for its own screen. Strings
 * asserted are French — this suite's default locale, same as every other
 * route test here.
 */

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

afterEach(() => {
  vi.unstubAllGlobals()
})

type MockFetchOptions = NonNullable<Parameters<typeof installMockFetch>[0]>

function signedIn(roles: readonly string[], theme?: MockFetchOptions['theme']): void {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
  installMockFetch({ roles, ...(theme === undefined ? {} : { theme }) })
}

async function goToScreen(): Promise<void> {
  window.history.pushState(null, '', '/theme-sandbox')
  render(<App />)
  await screen.findByRole('heading', { name: 'Thèmes locaux', level: 1 })
}

describe('the theme sandbox screen', () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    window.history.pushState(null, '', '/theme-sandbox')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('lists existing sandboxes and creates a new one', async () => {
    signedIn(['admin'], { sandboxIds: ['existing-sandbox'] })
    await goToScreen()

    expect(await screen.findByText('existing-sandbox')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Identifiant du nouveau bac à sable'), {
      target: { value: 'brand-new-sandbox' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))

    expect(await screen.findByText('brand-new-sandbox')).toBeDefined()
  })

  it('previews a sandbox in a real iframe', async () => {
    signedIn(['admin'], {
      sandboxIds: ['sbx-1'],
      sandboxPreviews: { 'sbx-1': { ok: true, html: '<p>hello from the sandbox</p>' } },
    })
    await goToScreen()
    await screen.findByText('sbx-1')

    const rows = screen.getAllByRole('button', { name: 'Aperçu' })
    fireEvent.click(rows[0] as HTMLElement)

    const dialog = await screen.findByRole('dialog')
    const iframe = await waitFor(() => {
      const el = dialog.querySelector('iframe')
      if (el === null) throw new Error('iframe not rendered yet')
      return el
    })
    expect(iframe.getAttribute('srcdoc')).toContain('hello from the sandbox')
  })

  it('shows a real refusal reason from the check, and only offers Deploy once it passes', async () => {
    signedIn(['admin'], {
      sandboxIds: ['sbx-2'],
      sandboxChecks: { 'sbx-2': { ok: false, reasons: ['nothing to deploy'] } },
    })
    await goToScreen()
    await screen.findByText('sbx-2')

    fireEvent.click(screen.getByRole('button', { name: 'Déployer' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(
      screen.getByLabelText("Nom du thème (le dossier qu'il devient sous themes/)"),
      {
        target: { value: 'my-theme' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    expect(await screen.findByText('nothing to deploy')).toBeDefined()
    expect(
      Array.from(dialog.querySelectorAll('button')).some((el) => el.textContent === 'Déployer'),
    ).toBe(false)
  })

  it('deploys a passing sandbox and shows a confirmation', async () => {
    signedIn(['admin'], { sandboxIds: ['sbx-3'] })
    await goToScreen()
    await screen.findByText('sbx-3')

    fireEvent.click(screen.getByRole('button', { name: 'Déployer' }))
    await screen.findByRole('dialog')
    fireEvent.change(
      screen.getByLabelText("Nom du thème (le dossier qu'il devient sous themes/)"),
      {
        target: { value: 'deployed-theme' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    await screen.findByText('Ce bac à sable est prêt à être déployé.')

    const confirmButtons = screen.getAllByRole('button', { name: 'Déployer' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1] as HTMLElement)

    expect(await screen.findByText('Déployé sous « deployed-theme ».')).toBeDefined()
  })

  it('lists archived versions for a theme and restores one', async () => {
    signedIn(['admin'], {
      themeVersions: { 'versioned-theme': ['2026-01-01T00-00-00-000Z'] },
      availableThemes: [
        {
          name: 'versioned-theme',
          label: 'Versioned theme',
          description: 'A local theme with history.',
        },
      ],
    })
    await goToScreen()

    fireEvent.change(screen.getByLabelText('Thème'), { target: { value: 'versioned-theme' } })
    fireEvent.click(screen.getByRole('button', { name: 'Charger les versions' }))

    expect(await screen.findByText('2026-01-01T00-00-00-000Z')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }))

    expect(await screen.findByText('Version « 2026-01-01T00-00-00-000Z » restaurée.')).toBeDefined()
  })

  it('downloads a real exported zip', async () => {
    const clickSpy = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') el.click = clickSpy
      return el
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    signedIn(['admin'], {
      availableThemes: [
        { name: 'exportable-theme', label: 'Exportable', description: 'A theme to export.' },
      ],
    })
    await goToScreen()

    fireEvent.change(screen.getByLabelText('Thème à exporter'), {
      target: { value: 'exportable-theme' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger en zip' }))

    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
  })

  it('imports a zip into a new sandbox', async () => {
    signedIn(['admin'])
    await goToScreen()

    fireEvent.change(screen.getByLabelText("Identifiant de bac à sable pour l'import"), {
      target: { value: 'freshly-imported' },
    })
    const file = new File(['zip bytes'], 'theme.zip', { type: 'application/zip' })
    fireEvent.change(screen.getByLabelText('Fichier zip'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }))

    expect(
      await screen.findByText(
        "Importé dans le bac à sable « freshly-imported » — prévisualisez-le et déployez-le comme n'importe quel autre bac à sable.",
      ),
    ).toBeDefined()
  })
})
