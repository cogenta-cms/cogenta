// Throwaway (not committed): renders a theme's Appearance gallery preview page
// with its own skin and screenshots it, the card an admin compares themes on.
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { loadThemeCss } from '../packages/cli/dist/commands/theme-css.js'
import {
  joinStyles,
  renderThemeGalleryPreview,
} from '../packages/cli/dist/commands/theme-render.js'
import { renderSkinCss, validateSkin } from '../packages/render/dist/index.js'

const [themeName, out, skinPath] = process.argv.slice(2)
const pkg = themeName.replace('@cogenta/', '')
const tokens = JSON.parse(
  await readFile(skinPath ?? new URL(`../packages/${pkg}/tokens.json`, import.meta.url), 'utf8'),
)
const themeCss = await loadThemeCss({ read: (url) => readFile(url, 'utf8') }, themeName)
const styles = joinStyles(renderSkinCss(validateSkin(tokens)), themeCss)
const html = await renderThemeGalleryPreview(themeName, {
  site: { name: 'Demo', url: 'https://example.com', locales: ['en'], defaultLocale: 'en' },
  styles,
})
await writeFile(`${out}.html`, html)
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' })
for (const [width, label] of [
  [1440, 'desktop'],
  [390, 'mobile'],
]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${out}-${label}.png`, fullPage: true })
  await page.close()
}
await browser.close()
