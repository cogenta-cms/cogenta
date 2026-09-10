import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { expectNoSeriousA11yViolations } from './helpers/axe.js'
import { installMockFetch, themeRefineRequests, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * The full-page "Generate a theme" workshop — describe a theme, attach
 * files, preview one or more AI-generated candidates and activate one, or
 * customize the theme already running instead of starting over.
 *
 * Every assertion here checks a real round trip through the mocked
 * `/api/theme` surface (`generate`, `preview`, `gallery-preview`,
 * `overrides`), the same discipline `appearance.test.tsx`/`site-plan.test.tsx`
 * already follow. Strings asserted are French — this suite's default
 * locale, same as every other route test here.
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

async function goToWorkshop(path = '/theme-generator'): Promise<void> {
  window.history.pushState(null, '', path)
  render(<App />)
  await screen.findByRole('heading', { name: "Générer un thème avec l'IA", level: 1 })
}

/**
 * The heading above resolves the instant the route mounts — before
 * `GET /api/theme` has even returned — so a test exercising the
 * AI-available form has to wait for something that only appears once that
 * fetch has settled and `aiAvailable` is known true. The mode group is that
 * marker: it renders only inside the `theme.aiAvailable` branch.
 */
async function waitForAiReady(): Promise<void> {
  await screen.findByRole('group', { name: 'Que faire' })
}

/**
 * jsdom implements neither `URL.createObjectURL` nor `revokeObjectURL`, and
 * the workshop uses them to show what was attached. Installing real-looking
 * ones (and putting the absence back afterwards) is what lets a test exercise
 * the thumbnail and the comparison view at all.
 */
function withObjectUrls(): void {
  const urls = URL as unknown as {
    createObjectURL: ((file: Blob) => string) | undefined
    revokeObjectURL: ((url: string) => void) | undefined
  }
  let next = 0
  urls.createObjectURL = () => {
    next += 1
    return `blob:cogenta-test/${next}`
  }
  urls.revokeObjectURL = () => undefined
  revokeObjectUrlStubs.push(() => {
    urls.createObjectURL = undefined
    urls.revokeObjectURL = undefined
  })
}

const revokeObjectUrlStubs: (() => void)[] = []

afterEach(() => {
  for (const restore of revokeObjectUrlStubs.splice(0)) restore()
})

/**
 * jsdom's `File` has no `arrayBuffer()` — the very method
 * `toGenerateThemeAttachment` reads an attachment with. Adding it here keeps
 * the production path (read the bytes, base64-encode them, send them) under
 * test rather than working around it in the screen.
 */
function imageFile(name: string): File {
  const bytes = new Uint8Array([1, 2, 3])
  const file = new File([bytes], name, { type: 'image/png' })
  if (typeof file.arrayBuffer !== 'function') {
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(bytes.buffer),
    })
  }
  return file
}

function attach(input: HTMLElement, file: File): void {
  fireEvent.change(input, { target: { files: [file] } })
}

const WARM_TOKENS = {
  color: {
    bg: '#fffaf3',
    fg: '#2a1d12',
    accent: '#c2410c',
    accentFg: '#ffffff',
    muted: '#f3e9dd',
    mutedFg: '#4b3a2a',
    border: '#e0d2bd',
  },
  font: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, SFMono-Regular, monospace',
    scale: 1.25,
    baseSize: '1rem',
  },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '2px', md: '6px', lg: '12px' },
  motion: { duration: '200ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
  shadow: { sm: '0 1px 2px rgba(0,0,0,.06)', md: '0 6px 20px rgba(0,0,0,.12)' },
}

describe('the theme generator workshop', () => {
  it('tells a non-admin the screen is admin-only', async () => {
    signedIn(['editor'])
    window.history.pushState(null, '', '/theme-generator')
    render(<App />)

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('explains there is no LLM provider and links to configure one, offering no form at all (R2)', async () => {
    signedIn(['admin'])
    await goToWorkshop()

    expect(
      await screen.findByText(/Générer ou personnaliser un thème avec l'IA nécessite/),
    ).toBeDefined()
    expect(screen.getByRole('link', { name: 'Configurer un fournisseur' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Générer' })).toBeNull()
    expect(screen.queryByLabelText('Description')).toBeNull()
  })

  it('defaults to "new theme" mode with the description field empty', async () => {
    signedIn(['admin'], { aiAvailable: true })
    await goToWorkshop()
    await waitForAiReady()

    expect(screen.getByRole('button', { name: 'Nouveau thème' })).toHaveProperty(
      'ariaPressed',
      'true',
    )
    expect(
      await screen.findByText(
        "L'IA propose un ou plusieurs thèmes entièrement nouveaux à partir de votre description.",
        { exact: false },
      ),
    ).toBeDefined()
    const generateButton = screen.getByRole('button', { name: 'Générer' })
    expect((generateButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('opens straight into "customize" mode when the URL carries ?baseline=, and names the theme', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      availableThemes: [
        {
          name: '@cogenta/theme-canonical',
          label: 'Canonical',
          description: 'The reference theme.',
          version: '1.1.0',
          author: 'Cogenta',
        },
      ],
    })
    await goToWorkshop('/theme-generator?baseline=%40cogenta%2Ftheme-canonical')
    await waitForAiReady()

    expect(screen.getByRole('button', { name: 'Personnaliser le thème actuel' })).toHaveProperty(
      'ariaPressed',
      'true',
    )
    expect(
      await screen.findByText(/L'IA ajuste Canonical — le thème actuellement en service/),
    ).toBeDefined()
  })

  it('generates candidates, previews each live, and activates none of them automatically (R6)', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          id: 'warm-editorial',
          label: 'Warm editorial',
          rationale: 'Warm, paper-like, generous whitespace.',
          tokens: WARM_TOKENS,
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    const description = screen.getByLabelText('Description')
    fireEvent.change(description, { target: { value: 'warm, editorial, paper-like' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    // A longer timeout than the default 1s: this round-trips through the
    // job's own poll interval (`JOB_POLL_INTERVAL_MS` in
    // `theme-generator.tsx`), which real timers can push past 1s under a
    // fully parallel `pnpm test` run.
    await screen.findByText('Warm editorial', {}, { timeout: 3000 })
    expect(screen.getByText('Warm, paper-like, generous whitespace.')).toBeDefined()

    // Not activated yet — the mock's own `themeOverrides.activeTheme` (read
    // through a fresh `GET /api/theme` after a real activation) would
    // change; nothing here triggers that until "Activer" is clicked.
    expect(screen.queryByText('Activé')).toBeNull()
  })

  it('shows a warning the server sent back rather than dropping it silently', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [],
      generateWarnings: ['An attached image could not be analyzed.'],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'a description' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    expect(
      await screen.findByText('An attached image could not be analyzed.', {}, { timeout: 3000 }),
    ).toBeDefined()
  })

  it('says so when no usable candidate came back', async () => {
    signedIn(['admin'], { aiAvailable: true, generateCandidates: [] })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'a description' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    expect(
      await screen.findByText(
        /Aucun candidat utilisable n'est revenu de cette description/,
        {},
        { timeout: 3000 },
      ),
    ).toBeDefined()
  })

  // Fiche feedback — "je ne sais pas si le traitement est en cours ou pas".
  // The mock keeps the job `'running'` for one poll before settling
  // (`mock-fetch.ts`'s own `mockThemeGenerateJobs`), so this actually
  // exercises the live progress list rendered while waiting, not just the
  // eventual candidates.
  it('shows live progress while candidates are being generated', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          id: 'warm-editorial',
          label: 'Warm editorial',
          rationale: 'Warm, paper-like.',
          tokens: WARM_TOKENS,
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'warm, editorial' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    const progress = await screen.findByTestId('theme-generator-progress', {}, { timeout: 3000 })
    expect(progress.textContent).toContain('Mock progress.')
    expect(progress.textContent).toContain('En cours')
  })

  // The single loudest complaint about this screen: the trace of what the
  // agent did was wiped the instant the run ended, so nobody could ever read
  // back which file was rejected and why.
  it('keeps the run log readable after the run has finished, and says the run finished', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateProgressEvents: [
        'Thinking… (step 3)',
        'Calling tool "theme.write_sandbox_file"…',
        'Tool "theme.write_sandbox_file" failed: the file is outside the sandbox.',
      ],
      generateCandidates: [
        {
          id: 'warm-editorial',
          label: 'Warm editorial',
          rationale: 'Warm, paper-like.',
          tokens: WARM_TOKENS,
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'warm, editorial' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
    await screen.findByText('Warm editorial', {}, { timeout: 3000 })

    const progress = screen.getByTestId('theme-generator-progress')
    expect(progress.textContent).toContain('Terminé')
    expect(progress.textContent).toContain('Thinking… (step 3)')
    expect(
      progress.textContent?.includes(
        'Tool "theme.write_sandbox_file" failed: the file is outside the sandbox.',
      ),
    ).toBe(true)
    // The failed line is announced as a failure, not merely coloured red.
    expect(progress.textContent).toContain('Échec : ')
  })

  it('lets the operator collapse the run log without emptying it', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateProgressEvents: ['Thinking… (step 1)'],
      generateCandidates: [],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'anything' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
    await screen.findByText('Thinking… (step 1)', {}, { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: 'Masquer le journal' }))
    expect(screen.queryByText('Thinking… (step 1)')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Afficher le journal' }))
    expect(screen.getByText('Thinking… (step 1)')).toBeDefined()
  })

  it('activates a candidate by saving its tokens wholesale, and confirms it', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          id: 'warm-editorial',
          label: 'Warm editorial',
          rationale: 'Warm, paper-like.',
          tokens: WARM_TOKENS,
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'warm, editorial' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
    await screen.findByText('Warm editorial', {}, { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))

    await waitFor(() => {
      expect(screen.getByText('Activé.')).toBeDefined()
    })
    expect(screen.getByRole('button', { name: 'Activé' })).toBeDefined()
  })

  it('sends activeTheme when a candidate names a theme package', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      availableThemes: [
        {
          name: '@cogenta/theme-canonical',
          label: 'Canonical',
          description: 'The reference theme.',
        },
        {
          name: '@cogenta/theme-portfolio',
          label: 'Portfolio',
          description: 'An ultra-modern portfolio theme.',
        },
      ],
      generateCandidates: [
        {
          id: 'portfolio-warm',
          label: 'Portfolio, warm',
          rationale: 'Warm palette on the portfolio layout.',
          tokens: WARM_TOKENS,
          themeName: '@cogenta/theme-portfolio',
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'a warm portfolio' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
    await screen.findByText('Portfolio, warm', {}, { timeout: 3000 })

    // The candidate targets Portfolio while Canonical is active — proof the
    // live preview actually carried the candidate's own tokens to the
    // foreign theme's gallery-preview render, not that theme's own default
    // skin (L26 task 5's gallery-preview widening).
    await waitFor(() => {
      const frame = document.querySelector('iframe') as HTMLIFrameElement | null
      expect(frame?.srcdoc ?? '').toContain(`accent:${WARM_TOKENS.color.accent}`)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await waitFor(() => expect(screen.getByText('Activé.')).toBeDefined())

    // Reflected back by the mock's own `GET /api/theme` after the write —
    // proof `activeTheme` really travelled on the `PUT`, not just the tokens.
    // Read from the preview panel's own "what is live right now" line, which
    // the screen re-fetches after every activation.
    expect(await screen.findByText(/Thème actif sur le site : Portfolio\./)).toBeDefined()
  })

  it('shows a thumbnail of each attached image rather than only its filename', async () => {
    withObjectUrls()
    signedIn(['admin'], { aiAvailable: true })
    await goToWorkshop()
    await waitForAiReady()

    attach(screen.getByLabelText(/Pièces jointes/), imageFile('mockup.png'))

    expect(
      (screen.getByAltText('Référence jointe : mockup.png') as HTMLImageElement).src,
    ).toContain('blob:')
    // Each "Retirer" carries the filename, so two attachments never share one
    // accessible name.
    expect(screen.getByRole('button', { name: 'Retirer la pièce jointe mockup.png' })).toBeDefined()
  })

  it('puts the attached reference and the candidate render side by side', async () => {
    withObjectUrls()
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          id: 'warm-editorial',
          label: 'Warm editorial',
          rationale: 'Warm, paper-like.',
          tokens: WARM_TOKENS,
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    attach(screen.getByLabelText(/Pièces jointes/), imageFile('reference.png'))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'like this' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
    await screen.findByText('Warm editorial', {}, { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: 'Comparer à la référence' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Votre référence')
    expect(dialog.textContent).toContain('Le candidat')
    expect(dialog.querySelector('img')?.getAttribute('alt')).toBe(
      'Référence jointe : reference.png',
    )
    // The candidate side is the same real server render the card shows, not a
    // screenshot: an iframe, and a reachable one now that it is enlarged.
    const frame = dialog.querySelector('iframe')
    expect(frame?.getAttribute('aria-hidden')).toBeNull()
  })

  it('offers no comparison when nothing was attached', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          id: 'warm-editorial',
          label: 'Warm editorial',
          rationale: 'Warm, paper-like.',
          tokens: WARM_TOKENS,
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'anything' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
    await screen.findByText('Warm editorial', {}, { timeout: 3000 })

    expect(screen.queryByRole('button', { name: 'Comparer à la référence' })).toBeNull()
    expect(screen.getByRole('button', { name: "Agrandir l'aperçu" })).toBeDefined()
  })

  it('lists the files a custom-layout candidate actually wrote, not just how many', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          kind: 'sandbox',
          id: 'custom-1',
          label: 'Custom layout',
          rationale: 'A real layout, not a recolour.',
          sandboxId: 'gen-1758',
          filesWritten: ['src/theme.ts', 'src/styles.css'],
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'a real layout' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))

    expect(
      await screen.findByText('2 fichier(s) de thème réel écrits', {}, { timeout: 3000 }),
    ).toBeDefined()
    expect(screen.getByText('src/theme.ts')).toBeDefined()
    expect(screen.getByText('src/styles.css')).toBeDefined()
  })

  it('refuses to activate a custom-layout candidate under an invalid theme name', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          kind: 'sandbox',
          id: 'custom-1',
          label: 'Custom layout',
          rationale: 'A real layout.',
          sandboxId: 'gen-1758',
          filesWritten: ['src/theme.ts'],
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'a real layout' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
    await screen.findByText('Mise en page personnalisée', {}, { timeout: 3000 })

    const name = screen.getByLabelText('Nom du thème') as HTMLInputElement
    expect(name.value).toBe('gen-1758')

    fireEvent.change(name, { target: { value: 'Ma Boutique' } })
    expect(screen.getByRole('alert').textContent).toContain('lettres minuscules')
    expect((screen.getByRole('button', { name: 'Activer' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('deploys a custom-layout candidate under the name the operator chose', async () => {
    signedIn(['admin'], {
      aiAvailable: true,
      generateCandidates: [
        {
          kind: 'sandbox',
          id: 'custom-1',
          label: 'Custom layout',
          rationale: 'A real layout.',
          sandboxId: 'gen-1758',
          filesWritten: ['src/theme.ts'],
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'a real layout' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
    await screen.findByText('Mise en page personnalisée', {}, { timeout: 3000 })

    fireEvent.change(screen.getByLabelText('Nom du thème'), { target: { value: 'ma-boutique' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await waitFor(() => expect(screen.getByText('Activé.')).toBeDefined())

    // Read back through a fresh `GET /api/theme`: the chosen name, not the
    // machine-minted sandbox id, is what the site now runs.
    expect(await screen.findByText(/Thème actif sur le site : ma-boutique\./)).toBeDefined()
  })

  it('has no serious accessibility violation with an attachment, a log and a candidate on screen', async () => {
    withObjectUrls()
    signedIn(['admin'], {
      aiAvailable: true,
      generateProgressEvents: ['Thinking… (step 1)', 'Tool "x" failed: nope.'],
      generateCandidates: [
        {
          kind: 'sandbox',
          id: 'custom-1',
          label: 'Custom layout',
          rationale: 'A real layout.',
          sandboxId: 'gen-1758',
          filesWritten: ['src/theme.ts'],
        },
      ],
    })
    await goToWorkshop()
    await waitForAiReady()

    attach(screen.getByLabelText(/Pièces jointes/), imageFile('reference.png'))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'like this' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
    await screen.findByText('Mise en page personnalisée', {}, { timeout: 3000 })

    await expectNoSeriousA11yViolations(document.body, { exclude: ['iframe'] })
  })

  // The product owner's own framing of what this screen has to be: the AI
  // generates, the user tries it, then asks for an adjustment — a discussion,
  // not a form that starts over on every click.
  describe('as a discussion', () => {
    const LONG_RATIONALE =
      'A very long explanation of every single decision, repeated at length, exactly the kind of thousands-of-words answer a real run came back with and which made the card unreadable.'

    const SANDBOX_RUN: MockFetchOptions['theme'] = {
      aiAvailable: true,
      generateCandidates: [
        {
          kind: 'sandbox',
          id: 'custom-1',
          label: 'Custom layout',
          rationale: LONG_RATIONALE,
          summary: 'Sombre, dense, deux colonnes.',
          sandboxId: 'gen-1758',
          filesWritten: ['src/theme.ts'],
        },
      ],
    }

    async function firstTurn(text: string): Promise<void> {
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: text } })
      fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
      await screen.findByText('Mise en page personnalisée', {}, { timeout: 3000 })
    }

    it('keeps what was asked on screen and offers a composer for the next turn', async () => {
      signedIn(['admin'], SANDBOX_RUN)
      await goToWorkshop()
      await waitForAiReady()
      await firstTurn('un thème sombre et dense')

      // The request itself stays readable in the discussion.
      expect(screen.getByText('un thème sombre et dense')).toBeDefined()
      // And there is somewhere to say the next thing, without starting over.
      expect(screen.getByLabelText('Votre demande')).toBeDefined()
      expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDefined()
      expect(screen.queryByLabelText('Description')).toBeNull()
    })

    it('shows the short summary and keeps the long rationale behind a disclosure', async () => {
      signedIn(['admin'], SANDBOX_RUN)
      await goToWorkshop()
      await waitForAiReady()
      await firstTurn('un thème sombre')

      expect(screen.getByText('Sombre, dense, deux colonnes.')).toBeDefined()
      expect(screen.getByText('Voir le raisonnement complet')).toBeDefined()
      // Present, but not spilling into the message: it lives inside the
      // disclosure, which is the whole point of the server sending `summary`.
      expect(screen.getByText(LONG_RATIONALE).closest('details')).not.toBeNull()
    })

    it('keeps the preview on screen and says which theme is actually live', async () => {
      signedIn(['admin'], SANDBOX_RUN)
      await goToWorkshop()
      await waitForAiReady()

      // Before anything ran, the panel is already there and says so.
      expect(screen.getByTestId('theme-generator-preview-empty').textContent).toContain(
        "L'aperçu apparaîtra ici",
      )

      await firstTurn('un thème sombre')
      const panel = screen.getByTestId('theme-generator-preview-panel')
      expect(panel.textContent).toContain('Mise en page personnalisée')
      expect(panel.textContent).toContain('Thème actif sur le site : Canonical.')
      // The iframe arrives with the preview render, one tick behind the
      // candidate itself — asserting it synchronously passes alone and fails
      // under the load of the whole file, which is a flaky test rather than a
      // real difference in behaviour.
      await waitFor(
        () => {
          expect(panel.querySelector('iframe')).not.toBeNull()
        },
        { timeout: 3000 },
      )
    })

    // The point of the whole screen: ask for a change, get a changed theme
    // back, and watch the preview follow — rather than starting over.
    it('answers a follow-up with a changed theme, and the preview follows', async () => {
      signedIn(['admin'], {
        ...SANDBOX_RUN,
        refineCandidates: [
          {
            kind: 'sandbox',
            id: 'custom-1',
            label: 'Custom layout',
            rationale: 'Darkened the ground and the cards; the serif heading is unchanged.',
            summary: 'Assombri, titrage inchangé.',
            sandboxId: 'gen-1758',
            filesWritten: ['style.css'],
          },
        ],
      })
      await goToWorkshop()
      await waitForAiReady()
      await firstTurn('un thème sombre')

      fireEvent.change(screen.getByLabelText('Votre demande'), {
        target: { value: 'rends-le plus sombre' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

      // The agent's answer to *this* turn, not the first turn replayed.
      expect(
        await screen.findByText('Assombri, titrage inchangé.', {}, { timeout: 3000 }),
      ).toBeDefined()
      expect(screen.getByText('rends-le plus sombre')).toBeDefined()
      expect(
        screen.getByTestId('theme-generator-preview-panel').querySelector('iframe'),
      ).not.toBeNull()
    })

    // Found in a live run: the second turn produced a genuinely darker theme
    // and the panel's own summary said so, while the thumbnail kept rendering
    // the first turn's theme — the preview was keyed on the candidate id, and
    // a refined candidate keeps its id while its content is exactly what
    // changed.
    it('re-renders the preview when a turn changes a candidate that kept its id', async () => {
      const DARK_TOKENS = {
        ...WARM_TOKENS,
        color: { ...WARM_TOKENS.color, bg: '#0e1013', accent: '#3ddc84' },
      }
      signedIn(['admin'], {
        aiAvailable: true,
        generateCandidates: [
          {
            id: 'warm-editorial',
            label: 'Warm editorial',
            rationale: 'Warm, paper-like.',
            summary: 'Fond crème.',
            tokens: WARM_TOKENS,
          },
        ],
        refineCandidates: [
          {
            // Same id on purpose — this is the case that was broken.
            id: 'warm-editorial',
            label: 'Warm editorial',
            rationale: 'Darkened, serif kept.',
            summary: 'Presque noir.',
            tokens: DARK_TOKENS,
          },
        ],
      })
      await goToWorkshop()
      await waitForAiReady()

      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'crème' } })
      fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
      await screen.findByText('Fond crème.', {}, { timeout: 3000 })

      // The mock echoes the accent into the previewed document, so the frame
      // itself is the evidence — not merely that a request went out.
      const frame = (): HTMLIFrameElement | null =>
        screen
          .getByTestId('theme-generator-preview-panel')
          .querySelector('iframe') as HTMLIFrameElement | null
      await waitFor(
        () => {
          expect(frame()?.getAttribute('srcdoc') ?? '').toContain(WARM_TOKENS.color.accent)
        },
        { timeout: 3000 },
      )

      fireEvent.change(screen.getByLabelText('Votre demande'), {
        target: { value: 'rends-le presque noir' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
      await screen.findByText('Presque noir.', {}, { timeout: 3000 })

      await waitFor(
        () => {
          expect(frame()?.getAttribute('srcdoc') ?? '').toContain('#3ddc84')
        },
        { timeout: 3000 },
      )
    })

    it('sends the sandbox being changed and the conversation so far, not just the last sentence', async () => {
      signedIn(['admin'], SANDBOX_RUN)
      await goToWorkshop()
      await waitForAiReady()
      await firstTurn('un thème sombre')

      fireEvent.change(screen.getByLabelText('Votre demande'), {
        target: { value: 'rends-le plus sombre' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

      await waitFor(
        () => {
          expect(themeRefineRequests).toHaveLength(1)
        },
        { timeout: 3000 },
      )

      const sent = themeRefineRequests[0] as {
        sandboxId?: string
        message?: string
        previousTurns?: readonly { role: string; message: string }[]
      }
      // The theme it must re-read before changing anything — the sandbox the
      // first turn actually wrote, not a new one.
      expect(sent.sandboxId).toBe('gen-1758')
      expect(sent.message).toBe('rends-le plus sombre')
      // And the original brief, so "plus sombre" has something to be relative to.
      expect(sent.previousTurns?.some((turn) => turn.message === 'un thème sombre')).toBe(true)
    })

    // A tokens candidate has no sandbox to re-read, so a follow-up on one is a
    // fresh generation rather than a refinement — the only thing the routes
    // that exist can honestly do.
    // The product owner's hard requirement: "au prochain tour on ne doit pas
    // repartir du début… si on repart du début on va avoir à chaque fois un
    // résultat différent." A token candidate has no sandbox to re-read, so
    // what it continues from is its own current token values — sent as the
    // baseline rather than dropped in favour of the original brief.
    it('continues from the token candidate on screen instead of generating again', async () => {
      signedIn(['admin'], {
        aiAvailable: true,
        generateCandidates: [
          {
            id: 'warm-editorial',
            label: 'Warm editorial',
            rationale: 'Warm, paper-like.',
            tokens: WARM_TOKENS,
          },
        ],
      })
      await goToWorkshop()
      await waitForAiReady()

      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'chaleureux' } })
      fireEvent.click(screen.getByRole('button', { name: 'Générer' }))
      await screen.findByText('Warm editorial', {}, { timeout: 3000 })

      fireEvent.change(screen.getByLabelText('Votre demande'), {
        target: { value: 'plus de contraste' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

      await waitFor(
        () => {
          expect(screen.getAllByTestId('theme-generator-progress')).toHaveLength(2)
        },
        { timeout: 3000 },
      )
      await waitFor(
        () => {
          const logs = screen.getAllByTestId('theme-generator-progress')
          expect(logs[1]?.textContent).toContain('Terminé')
        },
        { timeout: 3000 },
      )
      expect(screen.getByText('plus de contraste')).toBeDefined()

      // It went to the refinement route, carrying the tokens currently on
      // screen — not back to a fresh generation from the original brief.
      expect(themeRefineRequests).toHaveLength(1)
      const sent = themeRefineRequests[0] as {
        baseline?: { tokens?: Record<string, unknown> }
        message?: string
      }
      expect(sent.message).toBe('plus de contraste')
      expect(sent.baseline?.tokens).toEqual(WARM_TOKENS)
    })

    it('has no serious accessibility violation once a discussion is under way', async () => {
      withObjectUrls()
      signedIn(['admin'], SANDBOX_RUN)
      await goToWorkshop()
      await waitForAiReady()

      attach(screen.getByLabelText(/Pièces jointes/), imageFile('reference.png'))
      await firstTurn('un thème sombre')

      fireEvent.change(screen.getByLabelText('Votre demande'), {
        target: { value: 'rends-le plus sombre' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
      await waitFor(
        () => {
          expect(screen.getAllByTestId('theme-generator-progress').length).toBeGreaterThan(1)
        },
        { timeout: 3000 },
      )

      await expectNoSeriousA11yViolations(document.body, { exclude: ['iframe'] })
    })
  })

  // The two halves of "the AI builds my site" used to be watertight: a brief
  // was analysed on one screen, and the other asked for it again in an empty
  // box.
  it('opens with the brief already written when it arrives from a site plan', async () => {
    signedIn(['admin'], { aiAvailable: true })
    await goToWorkshop('/theme-generator?plan=draft-1')
    await waitForAiReady()

    const description = (await screen.findByLabelText('Description')) as HTMLTextAreaElement
    await waitFor(
      () => {
        expect(description.value).toContain('A neighbourhood restaurant.')
      },
      { timeout: 3000 },
    )
    expect(description.value).toContain('Local families.')
    expect(description.value).toContain('Warm and unfussy.')
    // And says where it came from, so nobody wonders who typed it.
    expect(screen.getByText(/reprise du plan de site/)).toBeDefined()
  })

  it('still opens empty when no plan is named', async () => {
    signedIn(['admin'], { aiAvailable: true })
    await goToWorkshop()
    await waitForAiReady()

    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('')
  })

  it('lets an operator switch between "new theme" and "customize current" from inside the workshop', async () => {
    signedIn(['admin'], { aiAvailable: true })
    await goToWorkshop()
    await waitForAiReady()

    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le thème actuel' }))
    expect(window.location.search).toContain('baseline=')
    expect(
      await screen.findByText(/L'IA ajuste Canonical — le thème actuellement en service/),
    ).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau thème' }))
    expect(window.location.search).not.toContain('baseline')
    expect(
      await screen.findByText(
        "L'IA propose un ou plusieurs thèmes entièrement nouveaux à partir de votre description.",
        { exact: false },
      ),
    ).toBeDefined()
  })
})
