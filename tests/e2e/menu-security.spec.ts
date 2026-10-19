import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures.js'

test('refuses executable menu URLs before they can reach a public browser', async ({
  request,
  page,
  adminToken,
}) => {
  const headers = { authorization: `Bearer ${adminToken}` }
  const created = await request.post('/api/menus', {
    headers,
    data: { name: `qa-${randomUUID()}`, locale: 'fr', label: 'Navigation de recette' },
  })
  expect(created.status()).toBe(201)
  const {
    data: { id },
  }: { data: { id: string } } = await created.json()
  for (const url of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ]) {
    const response = await request.post(`/api/menus/${id}/items`, {
      headers,
      data: { kind: 'url', label: 'Destination interdite', url },
    })
    expect(response.status(), url).toBe(400)
  }
  for (const url of [
    '/contact',
    'https://example.test/about',
    'mailto:contact@example.test',
    'tel:+33123456789',
  ]) {
    const response = await request.post(`/api/menus/${id}/items`, {
      headers,
      data: { kind: 'url', label: 'Destination autorisée', url },
    })
    expect(response.status(), url).toBe(201)
  }
  const legacy = await request.get('/api/menus/by-location/primary?locale=fr', { headers })
  expect(legacy.status()).toBe(200)
  const legacyBody: { data: { items: { label: string; url: string | null }[] } } =
    await legacy.json()
  // The REST API returns stored URL data, not a rendered href. Verify that
  // the real legacy fixture still contains all three unsafe values.
  expect(
    legacyBody.data.items
      .filter((item) => item.label.startsWith('Ancienne destination '))
      .map((item) => item.url),
  ).toEqual([
    'javascript:window.__cogenta_menu_injection=1',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ])
  const dialogs: string[] = []
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message())
    await dialog.dismiss()
  })
  await page.goto('/')
  expect(
    await page
      .locator('a[href]')
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute('href'))
          .filter((href) => /^\s*(javascript|data|vbscript):/i.test(href ?? '')),
      ),
  ).toEqual([])
  const safeNeighbour = page.getByRole('link', { name: 'Destination héritée sûre', exact: true })
  // At the mobile breakpoint the navigation is opened by its native CSS toggle.
  if (!(await safeNeighbour.isVisible())) {
    await page.locator('label[for="cg-nav-toggle"]').click()
  }
  await expect(safeNeighbour).toBeVisible()
  await expect(safeNeighbour).toHaveAttribute('href', '/qa-e2e-ready')
  for (let index = 0; index < 3; index += 1) {
    await expect(
      page.getByRole('link', { name: `Ancienne destination ${index}`, exact: true }),
    ).toHaveCount(0)
  }
  expect(await page.evaluate(() => '__cogenta_menu_injection' in window)).toBe(false)
  await safeNeighbour.click()
  await expect(page).toHaveURL(/\/qa-e2e-ready$/)
  expect(await page.evaluate(() => '__cogenta_menu_injection' in window)).toBe(false)
  expect(dialogs).toEqual([])
  expect((await request.delete(`/api/menus/${id}?cascade=true`, { headers })).status()).toBe(204)
})
