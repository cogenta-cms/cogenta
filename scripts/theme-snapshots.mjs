#!/usr/bin/env node
// Visual verification of a theme on a real scaffolded site.
//
// Scaffolds a blueprint with this checkout's own create-cogenta, serves it with
// this checkout's own cli, then captures every page at desktop and mobile width,
// light and dark, as readable bands (a 5 000 px full-page capture is unreadable
// once downscaled). Also reports what a screenshot cannot show: fonts that never
// loaded, broken images, horizontal overflow, scripts.
//
//   node scripts/theme-snapshots.mjs --blueprint saas --out /tmp/shots [--reuse]
//        [--pages /pricing,/blog] [--site-name "Ledgerline"] [--port 4711]
//
// Build first: pnpm turbo run build --filter=create-cogenta... --filter=@cogenta/cli...
// Uses Playwright's bundled Chromium, or CHROME_PATH when set.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({
  options: {
    blueprint: { type: 'string' },
    out: { type: 'string' },
    reuse: { type: 'boolean', default: false },
    pages: { type: 'string', default: '' },
    'site-name': { type: 'string' },
    port: { type: 'string' },
    band: { type: 'string', default: '1100' },
    'sites-dir': { type: 'string', default: join(tmpdir(), 'cogenta-theme-sites') },
  },
})
if (!values.blueprint || !values.out) {
  process.stderr.write(
    'usage: theme-snapshots.mjs --blueprint <id> --out <dir> [--reuse] [--pages /a,/b]\n',
  )
  process.exit(2)
}

const blueprint = values.blueprint
const out = resolve(values.out)
const port = Number(values.port ?? 4600 + Math.floor(Math.random() * 400))
const site = join(values['sites-dir'], blueprint)
const band = Number(values.band)
mkdirSync(values['sites-dir'], { recursive: true })
mkdirSync(out, { recursive: true })

const SITE_NAMES = {
  vitrine: 'Northfield Consulting',
  blog: 'Field Notes',
  magazine: 'The Meridian',
  portfolio: 'Studio Hale',
  documentation: 'Relay Docs',
  association: 'Common Ground',
  restaurant: 'Maison Verte',
  saas: 'Ledgerline',
  store: 'Atelier Goods',
}

function run(command, args, options = {}) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options })
    let log = ''
    child.stdout.on('data', (chunk) => {
      log += chunk
    })
    child.stderr.on('data', (chunk) => {
      log += chunk
    })
    child.on('exit', (code) =>
      code === 0
        ? done(log)
        : fail(new Error(`${command} ${args.join(' ')} exited ${code}\n${log}`)),
    )
  })
}

if (!values.reuse || !existsSync(site)) {
  rmSync(site, { recursive: true, force: true })
  const config = join(values['sites-dir'], `${blueprint}.json`)
  writeFileSync(
    config,
    JSON.stringify({
      blueprint,
      site: {
        name: values['site-name'] ?? SITE_NAMES[blueprint] ?? 'Demo Site',
        url: `http://127.0.0.1:${port}`,
      },
      database: { driver: 'sqlite' },
      adminEmail: 'admin@example.com',
    }),
  )
  await run('node', [join(repo, 'packages/create-cogenta/dist/bin.js'), site, '--config', config], {
    env: { ...process.env, CI: 'true' },
  })
}

const server = spawn(
  'node',
  [join(repo, 'packages/cli/dist/bin.js'), 'serve', '--port', String(port)],
  {
    cwd: site,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
let serverLog = ''
server.stdout.on('data', (chunk) => {
  serverLog += chunk
})
server.stderr.on('data', (chunk) => {
  serverLog += chunk
})
const base = `http://127.0.0.1:${port}`
let up = false
for (let attempt = 0; attempt < 120 && !up; attempt++) {
  try {
    up = (await fetch(`${base}/`)).status > 0
  } catch {
    await new Promise((wait) => setTimeout(wait, 500))
  }
}
if (!up) {
  server.kill()
  process.stderr.write(`server never answered on ${base}\n${serverLog}\n`)
  process.exit(1)
}

const ARCHIVE = /\/(category|categories|tag|tags|section|sections|topic|topics|term)\//
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
})
const report = { blueprint, base, site, pages: {} }

try {
  const probe = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await probe.goto(`${base}/`, { waitUntil: 'networkidle' })
  report.fonts = await probe.evaluate(async () => {
    await document.fonts.ready
    return [
      ...new Set(
        [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family),
      ),
    ]
  })
  const hrefs = await probe.$$eval('a[href^="/"]', (anchors) => [
    ...new Set(anchors.map((anchor) => anchor.getAttribute('href'))),
  ])
  await probe.close()
  const internal = hrefs.filter(
    (href) =>
      href &&
      href !== '/' &&
      !href.startsWith('/admin') &&
      !href.startsWith('/search') &&
      !href.includes('#'),
  )
  const archive = internal.find((href) => ARCHIVE.test(href))
  const entry = internal.find(
    (href) => href !== archive && href.split('/').filter(Boolean).length >= 2,
  )

  const targets = { home: '/' }
  if (entry) targets.entry = entry
  if (archive) targets.archive = archive
  for (const path of values.pages.split(',').filter(Boolean)) {
    targets[path.replaceAll('/', '_').replace(/^_/, '') || 'root'] = path
  }

  for (const [name, path] of Object.entries(targets)) {
    for (const [width, label] of [
      [1440, 'desktop'],
      [390, 'mobile'],
    ]) {
      for (const scheme of ['light', 'dark']) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          colorScheme: scheme,
        })
        const errors = []
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text())
        })
        const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 700) {
            window.scrollTo(0, y)
            await new Promise((wait) => setTimeout(wait, 50))
          }
          window.scrollTo(0, 0)
        })
        await page.waitForLoadState('networkidle')
        const facts = await page.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
          scripts: document.querySelectorAll('script').length,
          brokenImages: [...document.images]
            .filter(
              (image) =>
                image.complete &&
                image.naturalWidth === 0 &&
                !image.src.includes('/api/analytics/beacon'),
            )
            .map((image) => image.currentSrc || image.src),
          h1: document.querySelectorAll('h1').length,
          headingFont: getComputedStyle(document.querySelector('h1') ?? document.body).fontFamily,
          bodyFont: getComputedStyle(document.body).fontFamily,
        }))
        const files = []
        const bandHeight = label === 'mobile' ? band * 1.6 : band
        for (let top = 0, index = 0; top < facts.height; top += bandHeight, index++) {
          const file = join(
            out,
            `${blueprint}-${name}-${label}-${scheme}-${String(index).padStart(2, '0')}.png`,
          )
          await page.screenshot({
            path: file,
            fullPage: true,
            clip: { x: 0, y: top, width, height: Math.min(bandHeight, facts.height - top) },
          })
          files.push(file)
        }
        report.pages[`${name}-${label}-${scheme}`] = {
          path,
          status: response?.status(),
          ...facts,
          consoleErrors: errors,
          files,
        }
        await page.close()
      }
    }
  }
} finally {
  await browser.close()
  server.kill()
}

writeFileSync(join(out, `${blueprint}-report.json`), JSON.stringify(report, null, 2))
const summary = Object.entries(report.pages).map(
  ([key, facts]) =>
    `${key.padEnd(28)} ${facts.status} ${facts.path}  h1=${facts.h1} overflowX=${facts.overflowX} scripts=${facts.scripts} broken=${facts.brokenImages.length} bands=${facts.files.length}`,
)
const home = report.pages['home-desktop-light']
process.stdout.write(
  `fonts loaded: ${report.fonts.join(', ') || 'NONE'}\nh1 font: ${home?.headingFont}\nbody font: ${home?.bodyFont}\n${summary.join('\n')}\n${join(out, `${blueprint}-report.json`)}\n`,
)
