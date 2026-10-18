// Renders screens.html and logos.html to the PNG files the `saas` blueprint bundles.
//
//   google-chrome --headless=new --no-sandbox --remote-debugging-port=9342 about:blank &
//   node packages/starters/scripts/saas-assets/render.mjs http://127.0.0.1:9342
//
// Needs network access once, for the Google Fonts stylesheet (Geist, Geist Mono and
// the logo typefaces, all SIL Open Font License).
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

// sharp is a dependency of @cogenta/render, not of this package: resolve it from there.
const sharp = createRequire(new URL('../../../render/package.json', import.meta.url))('sharp')

const endpoint = process.argv[2] ?? 'http://127.0.0.1:9342'
const here = (name) => new URL(name, import.meta.url).href
const out = fileURLToPath(new URL('../../src/blueprints/assets/photos/saas/', import.meta.url))

const browser = await chromium.connectOverCDP(endpoint)
const screens = [
  // [view, file, css width, css height, device scale factor]
  ['app', 'approvals-queue', 1200, 760, 2],
  ['policy', 'policy-editor', 1600, 1000, 1],
  ['audit', 'audit-log', 1600, 1000, 1],
  ['erp', 'erp-sync', 1600, 1000, 1],
  ['sso', 'sso-scim', 1600, 1000, 1],
  ['spend', 'spend-reporting', 1600, 1000, 1],
  ['api', 'api-webhooks', 1600, 1000, 1],
]

for (const lang of ['en', 'fr']) {
  for (const [view, file, width, height, scale] of screens) {
    // A context of its own per screen: the device scale factor belongs to the context.
    const shot = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
      colorScheme: 'light',
    })
    const page = await shot.newPage()
    await page.goto(`${here('screens.html')}?lang=${lang}&view=${view}`)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${out}${file}-${lang}.png`, type: 'png' })
    await shot.close()
  }
}

// The French customers' wordmarks (the English ones were drawn earlier, 174 px high, cropped to
// their text): rendered at 2x, trimmed to their ink and scaled to 174 px high.
const logoContext = await browser.newContext({
  viewport: { width: 600, height: 200 },
  deviceScaleFactor: 2,
})
const logoPage = await logoContext.newPage()
await logoPage.goto(here('logos.html'))
await logoPage.evaluate(() => document.fonts.ready)
await logoPage.waitForTimeout(400)
for (const id of await logoPage.$$eval('.logo', (els) => els.map((el) => el.id))) {
  const raw = await (await logoPage.$(`#${id}`)).screenshot({ omitBackground: true })
  const trimmed = await sharp(raw).trim().toBuffer()
  await sharp(trimmed).resize({ height: 174 }).png().toFile(`${out}logo-${id}.png`)
}
await logoContext.close()
await browser.close()
