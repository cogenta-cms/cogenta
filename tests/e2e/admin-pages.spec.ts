import { NAV_ITEMS } from '../../packages/admin/src/shell/nav-items.js'
import { expect, test } from './fixtures.js'

test.beforeEach(async ({ page, adminToken }) => {
  await page.addInitScript((token) => {
    localStorage.setItem('cogenta.session.token', token)
    localStorage.setItem('cogenta.admin.language', 'fr')
  }, adminToken)
})

for (const path of [...new Set(NAV_ITEMS.map((item) => item.to))]) {
  test(`renders administration ${path} without a crash or horizontal page overflow`, async ({
    page,
  }, testInfo) => {
    const crashes: string[] = []
    page.on('pageerror', (error) => crashes.push(error.message))
    await page.goto(`/admin${path === '/' ? '/' : path}`)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('main')).not.toBeEmpty()
    await expect(page.locator('h1').first()).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true)
    expect(crashes).toEqual([])
    await testInfo.attach('Page de recette', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
}

test('creates and saves an entry with two initially empty rich-text fields', async ({
  page,
  request,
  adminToken,
}) => {
  await page.goto('/admin/collections/page/new')
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(2)
  const title = `Recette ${Date.now()}`
  await page.getByLabel(/^Titre\s*\*?$/u).fill(title)
  await page.locator('[contenteditable="true"]').nth(0).fill('Premier texte.')
  await page.locator('[contenteditable="true"]').nth(1).fill('Second texte indépendant.')
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('/api/content/page'),
  )
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  expect((await saved).status()).toBe(201)
  await expect(page).toHaveURL(/\/collections\/page\/[a-z0-9-]+$/)
  await page.reload()
  await expect(page.locator('[contenteditable="true"]').nth(0)).toHaveText('Premier texte.')
  await expect(page.locator('[contenteditable="true"]').nth(1)).toHaveText(
    'Second texte indépendant.',
  )
  const id = new URL(page.url()).pathname.split('/').at(-1)
  expect(
    (
      await request.delete(`/api/content/page/${id}`, {
        headers: { authorization: `Bearer ${adminToken}` },
      })
    ).status(),
  ).toBe(204)
})
