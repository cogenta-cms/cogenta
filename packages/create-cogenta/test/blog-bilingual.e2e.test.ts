import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOutput, runServe } from '@cogenta/cli'
import { createLogger } from '@cogenta/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

/**
 * A blog scaffolded in French and English is bilingual for real: the default
 * language at the unprefixed URLs, the other under `/en/`, its own home page,
 * its own lists, its own sidebar, and a way to switch between the two.
 *
 * Found by an end-to-end run of the container image on Kubernetes: `/en/…` was
 * a 404, `/` could only be the French home, an English article carried a French
 * sidebar and a "further reading" list of French essays, and nothing linked the
 * two languages. Every assertion here is made against a real scaffold served by
 * a real `cogenta serve` on SQLite — what a visitor's browser would receive.
 */

const FR_ARTICLE = '/blog/pourquoi-jecris-en-texte-brut'
const EN_ARTICLE = '/en/blog/plain-text-editor'

let targetDir = ''
let base = ''
let stop: () => Promise<void> = async () => undefined

async function get(path: string): Promise<{ status: number; html: string }> {
  const response = await fetch(`${base}${path}`)
  return { status: response.status, html: await response.text() }
}

/** The href of every anchor in a document. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*?\bhref="([^"]*)"/gu)].map((match) => match[1] ?? '')
}

/** The language switcher's own markup, or an empty string. */
function switcherOf(html: string): string {
  return /<nav class="cg-lang"[\s\S]*?<\/nav>/u.exec(html)?.[0] ?? ''
}

/** The anchors of the page that are not in the language switcher. */
function hrefsOutsideSwitcher(html: string): string[] {
  return hrefs(html.replace(switcherOf(html), ''))
}

describe('a blog scaffolded in French and English', () => {
  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-blog-bilingual-'))
    const result = await scaffoldSite({
      targetDir,
      siteName: 'Le Carnet de quai',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'fr',
      locales: ['fr', 'en'],
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'blog',
    })
    expect(result.migrateExitCode).toBe(0)

    const controller = new AbortController()
    let address: { port: number; host: string } | undefined
    const done = runServe({
      cwd: targetDir,
      env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
      logger: createLogger({ level: 'silent' }),
      out: createOutput(() => undefined, false),
      stderr: () => undefined,
      port: 0,
      signal: controller.signal,
      onListening: (a) => {
        address = a
      },
    })
    for (let attempt = 0; attempt < 3000 && address === undefined; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    if (address === undefined) throw new Error('server never started listening')
    base = `http://${address.host}:${address.port}`
    stop = async () => {
      controller.abort()
      await done
    }
  }, 180_000)

  afterAll(async () => {
    await stop()
    if (targetDir !== '') await rm(targetDir, { recursive: true, force: true })
  })

  it('serves the French home at / in French and the English home at /en/ in English', async () => {
    const fr = await get('/')
    const en = await get('/en/')
    expect(fr.status).toBe(200)
    expect(fr.html).toContain('<html lang="fr"')
    expect(en.status).toBe(200)
    expect(en.html).toContain('<html lang="en"')
    // `/en` without the slash is the same front door.
    expect((await get('/en')).status).toBe(200)
    // The English home is its own page, in English.
    expect(en.html).toContain('Subscribe')
    expect(fr.html).not.toContain('Subscribe')
  })

  it('lists the essays of the home page in the language of that page', async () => {
    const fr = await get('/')
    const en = await get('/en/')
    const frEssays = hrefsOutsideSwitcher(fr.html).filter((href) => /^\/(en\/)?blog\//u.test(href))
    const enEssays = hrefsOutsideSwitcher(en.html).filter((href) => /^\/(en\/)?blog\//u.test(href))
    expect(frEssays.length).toBeGreaterThan(5)
    expect(enEssays.length).toBeGreaterThan(5)
    expect(frEssays.every((href) => href.startsWith('/blog/'))).toBe(true)
    expect(enEssays.every((href) => href.startsWith('/en/blog/'))).toBe(true)
  })

  it('never writes the default language with its prefix', async () => {
    for (const path of ['/', FR_ARTICLE, '/archives', '/a-propos']) {
      const { status, html } = await get(path)
      expect(status).toBe(200)
      expect(hrefs(html).filter((href) => href.startsWith('/fr/'))).toEqual([])
    }
  })

  it('shows an English essay with an English sidebar and an English "read next" list', async () => {
    const { status, html } = await get(EN_ARTICLE)
    expect(status).toBe(200)
    expect(html).toContain('<html lang="en"')
    // Every link to an essay, outside the switcher, is an English essay.
    const essays = hrefsOutsideSwitcher(html).filter((href) => /^\/(en\/)?blog\//u.test(href))
    expect(essays.length).toBeGreaterThan(3)
    expect(essays.filter((href) => !href.startsWith('/en/blog/'))).toEqual([])
    // The widgets are the English ones.
    expect(html).toContain('Further reading')
    expect(html).toContain('Recently')
    expect(html).not.toContain('À lire ensuite')
    expect(html).not.toContain('Récemment')
    // The subject above the title is named in English too.
    const beforeTitle = html.slice(0, html.indexOf('<h1'))
    expect(beforeTitle).toContain('Writing')
    expect(beforeTitle).not.toContain('Écriture')
    // And so is the navigation: the English pages, not the French ones.
    const links = hrefsOutsideSwitcher(html)
    expect(links).toContain('/en/about')
    expect(links).not.toContain('/a-propos')
  })

  it('shows a French essay with French widgets and no English essay in them', async () => {
    const { html } = await get(FR_ARTICLE)
    expect(html).toContain('À lire ensuite')
    const essays = hrefsOutsideSwitcher(html).filter((href) => /^\/(en\/)?blog\//u.test(href))
    expect(essays.filter((href) => href.startsWith('/en/'))).toEqual([])
  })

  it('counts the subjects of a page in its own language, not once per translation', async () => {
    const fr = await get(FR_ARTICLE)
    const en = await get(EN_ARTICLE)
    const counts = (html: string): number[] =>
      [...html.matchAll(/class="cg-widget__terms-count">(\d+)</gu)].map((match) => Number(match[1]))
    expect(counts(fr.html).reduce((a, b) => a + b, 0)).toBe(10)
    expect(counts(en.html).reduce((a, b) => a + b, 0)).toBe(10)
  })

  it('links the two translations of an essay from the language switcher, in both directions', async () => {
    const fr = await get(FR_ARTICLE)
    const en = await get(EN_ARTICLE)
    const frSwitcher = switcherOf(fr.html)
    const enSwitcher = switcherOf(en.html)
    expect(frSwitcher).toContain(`href="${FR_ARTICLE}" lang="fr" hreflang="fr" aria-current="true"`)
    expect(frSwitcher).toContain(`href="${EN_ARTICLE}" lang="en" hreflang="en"`)
    expect(enSwitcher).toContain(`href="${EN_ARTICLE}" lang="en" hreflang="en" aria-current="true"`)
    expect(enSwitcher).toContain(`href="${FR_ARTICLE}" lang="fr" hreflang="fr"`)
  })

  it('sends the home page of each language to the other home page', async () => {
    expect(switcherOf((await get('/')).html)).toContain('href="/en/" lang="en"')
    expect(switcherOf((await get('/en/')).html)).toContain('href="/" lang="fr"')
  })

  it('sends a page without a translation to the home page of the other language', async () => {
    const credits = await get('/credits-photo')
    expect(switcherOf(credits.html)).toContain('href="/en/photo-credits" lang="en"')
    // A page that does not exist in the other language is not a dead link.
    expect((await get('/en/credits-photo')).status).toBe(404)
  })

  it('does not serve an essay under the other language', async () => {
    expect((await get('/en/blog/pourquoi-jecris-en-texte-brut')).status).toBe(404)
    expect((await get('/blog/plain-text-editor')).status).toBe(404)
  })

  it('keeps the canonical addresses and the hreflang cluster of each essay correct', async () => {
    const en = await get(EN_ARTICLE)
    expect(en.html).toContain(`<link rel="canonical" href="http://localhost:4000${EN_ARTICLE}"`)
    expect(en.html).toContain(`hreflang="fr" href="http://localhost:4000${FR_ARTICLE}"`)
    expect(en.html).toContain(`hreflang="en" href="http://localhost:4000${EN_ARTICLE}"`)

    const sitemap = (await get('/sitemap.xml')).html
    expect(sitemap).toContain(`<loc>http://localhost:4000${EN_ARTICLE}</loc>`)
    expect(sitemap).toContain(`<loc>http://localhost:4000${FR_ARTICLE}</loc>`)
    expect(sitemap).toContain(
      `<xhtml:link rel="alternate" hreflang="en" href="http://localhost:4000${EN_ARTICLE}" />`,
    )
    expect(sitemap).not.toContain('/fr/')
  })
}, 180_000)
