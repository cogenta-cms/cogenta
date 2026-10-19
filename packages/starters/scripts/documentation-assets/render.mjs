// Renders delivery-flow.html to the two PNGs the blueprint bundles.
// Usage: start Chrome with --remote-debugging-port=<port>, then
//   node render.mjs <port>
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')
const port = process.argv[2] ?? '9222'
const here = fileURLToPath(new URL('.', import.meta.url))
const out = fileURLToPath(
  new URL('../../src/blueprints/assets/photos/documentation/', import.meta.url),
)

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
const context = await browser.newContext({
  viewport: { width: 588, height: 448 },
  deviceScaleFactor: 3.5,
})
const page = await context.newPage()
for (const lang of ['fr', 'en']) {
  await page.goto(`file://${here}delivery-flow.html?lang=${lang}`)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}delivery-flow-${lang}.png` })
}
await context.close()
await browser.close()
