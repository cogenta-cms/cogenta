import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOutput } from '@cogenta/cli'
import { afterEach, describe, expect, it } from 'vitest'
import { type Choice, createDefaultsPrompter, type Prompter } from '../src/prompts.js'
import { runWizard } from '../src/wizard.js'

/**
 * L19 end to end, through the real installer: a real document on disk, read
 * by the real extractor, analysed and proposed by the real agents, reviewed
 * item by item through the real prompter, and applied by the real
 * scaffolder to a real SQLite database.
 *
 * The only thing standing in for reality is the network: `fetchImpl` — the
 * seam `llm-setup.ts` has carried since L9 — answers with the JSON a model
 * would have returned. That is the one part a test cannot own, and mocking
 * the module instead would have hidden the wiring this test exists to prove.
 */

const BRIEF = `# Cahier des charges — Le Petit Marché

## Objectif

Un site vitrine pour un restaurant de quartier à Lyon. La carte change toutes
les trois semaines et nos clients la demandent au téléphone.

## Pages attendues

- Accueil, avec la carte du jour
- La carte
- Contact

## Contraintes

- Pas de blog. Nous n'aurons jamais le temps d'écrire des articles.
- Pas de vente en ligne ni de paiement.
- Le site doit être en français uniquement.
`

const BRIEF_REPLY = JSON.stringify({
  activity: 'Un restaurant de quartier à Lyon qui sert une carte de saison.',
  audience: 'Les habitants du quartier.',
  tone: 'Chaleureux et familial.',
  languages: ['fr'],
  pages: [
    { title: 'Accueil', purpose: 'La carte du jour.' },
    { title: 'La carte', purpose: 'La carte complète.' },
  ],
  contentTypes: [{ name: 'plat', description: 'Un plat de la carte.' }],
  constraints: [],
  summary: 'Un petit site vitrine pour un restaurant, la carte en premier.',
})

/** A faithful model — plus one blog collection the document forbids. */
const MODEL_REPLY = JSON.stringify({
  collections: [
    {
      name: 'dish',
      labels: { singular: 'Plat', plural: 'Plats' },
      routing: { pattern: '/carte/:slug' },
      fields: {
        title: { kind: 'text', required: true, options: { max: 200 } },
        slug: { kind: 'slug', unique: true, options: { from: 'title' } },
        price: { kind: 'number', options: { min: 0 } },
      },
      permissions: { read: ['public'], create: ['editor', 'admin'], delete: ['admin'] },
      rationale: 'La carte est le cœur du site.',
    },
    {
      name: 'post',
      labels: { singular: 'Article', plural: 'Articles' },
      fields: { title: { kind: 'text', required: true } },
      permissions: { read: ['public'] },
      rationale: 'Un blog pour partager des recettes.',
    },
  ],
  pages: [
    { title: 'Accueil', slug: 'home', purpose: 'La carte du jour.' },
    { title: 'Actualités', slug: 'actualites', purpose: 'Des recettes.' },
  ],
})

const DEMO_REPLY = JSON.stringify({
  entries: [
    {
      collection: 'dish',
      values: { title: 'Velouté de courge', slug: 'veloute-de-courge', price: 9 },
    },
    { collection: 'dish', values: { title: 'Poulet fermier', slug: 'poulet-fermier', price: 21 } },
  ],
})

const VALID_TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f2f4f7',
    mutedFg: '#3f4655',
    border: '#d7dbe2',
  },
  font: { sans: 'sans-serif', serif: 'serif', mono: 'monospace', scale: 1.25, baseSize: '1rem' },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
  motion: { duration: '180ms', easing: 'linear', reduced: true },
  shadow: { sm: '0 1px 2px rgba(0,0,0,.1)', md: '0 6px 24px rgba(0,0,0,.1)' },
}

const SKIN_ACCENTS: Readonly<Record<string, string>> = {
  'Warm and editorial': '#b45309',
  'Clean and clinical': '#1d4ed8',
  'Bold and graphic': '#7c2d12',
}

/** Answers an Anthropic-shaped request with whatever the prompt is asking for. */
function fakeAnthropic(): { fetchImpl: typeof fetch; calls: number } {
  const state = { calls: 0 }
  const fetchImpl: typeof fetch = async (_url, init) => {
    state.calls++
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      system?: string
      messages: { content?: string }[]
    }
    const prompt = body.messages.at(-1)?.content ?? ''

    let text: string
    if (prompt.includes('visual design tokens')) {
      const label =
        Object.keys(SKIN_ACCENTS).find((name) => prompt.includes(name)) ?? 'Warm and editorial'
      text = JSON.stringify({
        ...VALID_TOKENS,
        color: { ...VALID_TOKENS.color, accent: SKIN_ACCENTS[label] ?? '#1d4ed8' },
      })
    } else if (prompt.includes('demonstration content')) text = DEMO_REPLY
    else if (prompt.includes('content model of a Cogenta CMS site')) text = MODEL_REPLY
    else if (prompt === 'ping') text = 'pong'
    else text = BRIEF_REPLY

    return new Response(
      JSON.stringify({
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  return {
    fetchImpl,
    get calls() {
      return state.calls
    },
  }
}

/**
 * Answers questions by matching the question text — the way a person reads
 * the screen — rather than by counting, so inserting a question does not
 * silently shift every later answer onto the wrong one.
 */
function scriptedPrompter(script: {
  readonly confirms?: readonly { readonly match: string; readonly answer: boolean }[]
  readonly texts?: readonly { readonly match: string; readonly answer: string }[]
  readonly choices?: readonly { readonly match: string; readonly label: string }[]
  readonly asked?: string[]
}): Prompter {
  return {
    async text(question, defaultValue) {
      script.asked?.push(question)
      return script.texts?.find((entry) => question.includes(entry.match))?.answer ?? defaultValue
    },
    async secret(question) {
      script.asked?.push(question)
      return script.texts?.find((entry) => question.includes(entry.match))?.answer ?? ''
    },
    async choice<T>(question: string, choices: readonly Choice<T>[], defaultIndex: number) {
      script.asked?.push(question)
      const wanted = script.choices?.find((entry) => question.includes(entry.match))?.label
      // No script for this question: take its own default, the way pressing
      // Enter would — never a fuzzy match against nothing.
      const found =
        wanted === undefined ? undefined : choices.find((entry) => entry.label.includes(wanted))
      return (found ?? choices[defaultIndex] ?? choices[0])?.value as T
    },
    async confirm(question, defaultValue) {
      script.asked?.push(question)
      return (
        script.confirms?.find((entry) => question.includes(entry.match))?.answer ?? defaultValue
      )
    },
    close() {},
  }
}

function captureOutput() {
  const chunks: string[] = []
  return { out: createOutput((text) => chunks.push(text), false), text: () => chunks.join('') }
}

describe('installing from a specification document', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function workspace(): Promise<{ targetDir: string; briefPath: string }> {
    const root = await mkdtemp(join(tmpdir(), 'cogenta-l19-'))
    dirs.push(root)
    const targetDir = join(root, 'site')
    const briefPath = join(root, 'cahier-des-charges.md')
    await writeFile(briefPath, BRIEF, 'utf8')
    return { targetDir, briefPath }
  }

  it('reads the document, proposes a plan, and applies only what the human accepted', async () => {
    const { targetDir, briefPath } = await workspace()
    const { out, text } = captureOutput()
    const asked: string[] = []

    const exitCode = await runWizard({
      targetDir,
      siteName: 'le-petit-marche',
      out,
      env: {},
      fetchImpl: fakeAnthropic().fetchImpl,
      prompter: scriptedPrompter({
        asked,
        choices: [
          { match: 'LLM provider', label: 'Anthropic' },
          { match: 'Which one?', label: 'Clean and clinical' },
        ],
        texts: [
          { match: 'API key', answer: 'sk-test' },
          { match: 'Path(s) to the document', answer: briefPath },
        ],
        confirms: [
          { match: 'specification document', answer: true },
          { match: 'Review this proposal', answer: true },
          // Keep the menu, refuse one demo entry — a real, partial review.
          { match: 'Poulet fermier', answer: false },
        ],
      }),
    })

    expect(exitCode).toBe(0)

    // The plan really shaped the site: the approved collection is in the schema.
    const schema = await readFile(join(targetDir, 'cogenta.schema.mjs'), 'utf8')
    expect(schema).toContain('"name": "dish"')
    // And the blog the document forbids is not, though the model proposed it.
    expect(schema).not.toContain('"name": "post"')
    expect(text()).toContain('rules out blog')

    // One of the two demonstration entries was refused, one applied.
    expect(text()).toMatch(/1 demonstration entry was created as drafts?|1 demonstration entry/)

    // The design the human picked was written, not a default.
    const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8')) as {
      color: { accent: string }
    }
    expect(tokens.color.accent).toBe(SKIN_ACCENTS['Clean and clinical'])

    // The review really was item by item — every proposed thing was asked about.
    expect(asked.filter((question) => question.startsWith('Keep “')).length).toBeGreaterThan(3)
    expect(asked.some((question) => question.includes('Keep “Plats (dish)”'))).toBe(true)

    // The entry a model wrote is a draft, and is marked as generated —
    // contract A calls "provenance" non-optional because the European AI
    // framework requires it, and the store's own default is "human".
    const { createSqliteHandle } = await import('@cogenta/core')
    const db = await createSqliteHandle({ url: join(targetDir, '.cogenta', 'site.db') })
    const rows = await db.execute<{ status: string; provenance: string }>({
      text: 'select status, provenance from cogenta_dish',
      params: [],
    })
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]?.status).toBe('draft')
    expect(rows.rows[0]?.provenance).toBe('generated')
    await db.close()
  }, 120_000)

  it('pre-fills the later questions from the brief, and says it is only a suggestion', async () => {
    const { targetDir, briefPath } = await workspace()
    const { out, text } = captureOutput()
    const defaults: string[] = []

    await runWizard({
      targetDir,
      siteName: 'le-petit-marche',
      out,
      env: {},
      fetchImpl: fakeAnthropic().fetchImpl,
      prompter: {
        async text(question, defaultValue) {
          defaults.push(`${question} => ${defaultValue}`)
          if (question.includes('Path(s) to the document')) return briefPath
          return defaultValue
        },
        async secret(question) {
          if (question.includes('API key')) return 'sk-test'
          return ''
        },
        async choice<T>(question: string, choices: readonly Choice<T>[], defaultIndex: number) {
          if (question.includes('LLM provider')) {
            return choices.find((entry) => entry.label.includes('Anthropic'))?.value as T
          }
          defaults.push(`${question} => ${choices[defaultIndex]?.label ?? ''}`)
          return (choices[defaultIndex] ?? choices[0])?.value as T
        },
        async confirm(question, defaultValue) {
          if (question.includes('specification document')) return true
          if (question.includes('Review this proposal')) return true
          return defaultValue
        },
        close() {},
      },
    })

    expect(text()).toContain('Pre-filled from your document')
    expect(text()).toContain('only a suggestion')
    // The language question defaults to what the brief says, not to "en".
    expect(defaults.some((line) => line.includes('Primary language') && line.endsWith('fr'))).toBe(
      true,
    )
    // The site type defaults to the one inferred from the brief.
    expect(defaults.some((line) => line.includes('Site type') && line.includes('Restaurant'))).toBe(
      true,
    )
  }, 120_000)

  it('saves an unreviewed proposal as a draft instead of applying it', async () => {
    const { targetDir, briefPath } = await workspace()
    const { out, text } = captureOutput()

    await runWizard({
      targetDir,
      siteName: 'le-petit-marche',
      out,
      env: {},
      fetchImpl: fakeAnthropic().fetchImpl,
      prompter: scriptedPrompter({
        choices: [{ match: 'LLM provider', label: 'Anthropic' }],
        texts: [
          { match: 'API key', answer: 'sk-test' },
          { match: 'Path(s) to the document', answer: briefPath },
        ],
        confirms: [
          { match: 'specification document', answer: true },
          { match: 'Review this proposal', answer: false },
        ],
      }),
    })

    const schema = await readFile(join(targetDir, 'cogenta.schema.mjs'), 'utf8')
    expect(schema).not.toContain('"name": "dish"')
    const drafts = await readdir(join(targetDir, '.cogenta', 'site-plans'))
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.endsWith('.plan.json')).toBe(true)
    expect(text()).toContain('nobody reviewed it')
  }, 120_000)

  it('reports a document it cannot read, and still installs the site', async () => {
    const { targetDir } = await workspace()
    const { out, text } = captureOutput()

    const exitCode = await runWizard({
      targetDir,
      siteName: 'le-petit-marche',
      out,
      env: {},
      fetchImpl: fakeAnthropic().fetchImpl,
      prompter: scriptedPrompter({
        choices: [{ match: 'LLM provider', label: 'Anthropic' }],
        texts: [
          { match: 'API key', answer: 'sk-test' },
          { match: 'Path(s) to the document', answer: join(targetDir, 'nope.pdf') },
        ],
        confirms: [{ match: 'specification document', answer: true }],
      }),
    })

    expect(exitCode).toBe(0)
    expect(text()).toContain('nope.pdf')
  }, 120_000)
})

describe('R2 — the installer without a document or a provider', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('never even asks about a document when no provider is configured', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-l19-none-'))
    dirs.push(targetDir)
    const { out } = captureOutput()
    const asked: string[] = []

    const exitCode = await runWizard({
      targetDir,
      siteName: 'plain-site',
      out,
      env: {},
      prompter: scriptedPrompter({ asked }),
    })

    expect(exitCode).toBe(0)
    expect(asked.some((question) => question.includes('specification document'))).toBe(false)
    expect(asked.some((question) => question.includes('API key'))).toBe(false)
  }, 120_000)

  it('produces a site with no site-plan draft, no approved collections and the default skin', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-l19-none-'))
    dirs.push(targetDir)
    const { out } = captureOutput()

    const exitCode = await runWizard({
      targetDir,
      siteName: 'plain-site',
      out,
      env: {},
      prompter: createDefaultsPrompter(),
    })

    expect(exitCode).toBe(0)
    // `blank` is the default site type: an empty schema, exactly as before L19.
    const schema = await readFile(join(targetDir, 'cogenta.schema.mjs'), 'utf8')
    expect(schema.trim()).toBe('export default []')
    await expect(readdir(join(targetDir, '.cogenta', 'site-plans'))).rejects.toThrow()
  }, 120_000)
})
