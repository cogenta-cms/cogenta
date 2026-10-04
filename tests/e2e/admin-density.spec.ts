import { expect, test } from './fixtures.js'

test.beforeEach(async ({ page, adminToken }) => {
  await page.addInitScript((token) => {
    localStorage.setItem('cogenta.session.token', token)
    localStorage.setItem('cogenta.admin.language', 'fr')
  }, adminToken)
})

test('a large form list stays bounded and edits on its second page are persisted', async ({
  page,
  request,
  adminToken,
}, info) => {
  const headers = { authorization: `Bearer ${adminToken}` }
  const prefix = `qa-density-${info.project.name}-${Date.now()}`
  const ids: string[] = []
  try {
    for (let index = 0; index < 25; index++) {
      const response = await request.post('/api/forms', {
        headers,
        data: {
          name: `${prefix}-${index}`,
          label: `${prefix} ${String(index).padStart(2, '0')}`,
          fields: [{ name: 'message', label: 'Message', kind: 'text' }],
        },
      })
      expect(response.status()).toBe(201)
      const body: { data: { id: string } } = await response.json()
      ids.push(body.data.id)
    }
    await page.goto('/admin/forms')
    await page.getByLabel('Rechercher dans la liste', { exact: true }).fill(prefix)
    const rows = page.locator('main tbody tr')
    await expect(rows).toHaveCount(10)
    const initialNames = await rows.locator('td:first-child').allTextContents()
    await page.getByRole('button', { name: 'Suivant', exact: true }).first().click()
    await expect(rows).toHaveCount(10)
    const secondNames = await rows.locator('td:first-child').allTextContents()
    expect(secondNames.some((name) => initialNames.includes(name))).toBe(false)
    const renamed = `${prefix} edited on page two`
    await rows.first().getByRole('button', { name: 'Modifier', exact: true }).click()
    await page.getByLabel('Libellé', { exact: true }).fill(renamed)
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' && response.url().includes('/api/forms/'),
    )
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await page.getByLabel('Rechercher dans la liste', { exact: true }).fill(renamed)
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(renamed)
    await page.reload()
    await page.getByLabel('Rechercher dans la liste', { exact: true }).fill(renamed)
    await expect(rows.first()).toContainText(renamed)
    const data: { data: { label: string }[] } = await (
      await request.get('/api/forms', { headers })
    ).json()
    expect(data.data.some((form) => form.label === renamed)).toBe(true)
    await info.attach('Formulaire modifié depuis la deuxième page', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  } finally {
    for (const id of ids)
      expect((await request.delete(`/api/forms/${id}`, { headers })).status()).toBe(204)
  }
})

test('all eight menu levels remain operable at 320 pixels without horizontal page overflow', async ({
  page,
  request,
  adminToken,
}, info) => {
  const headers = { authorization: `Bearer ${adminToken}` }
  const name = `qa-deep-${info.project.name}-${Date.now()}`
  const response = await request.post('/api/menus', {
    headers,
    data: { name, label: name, locale: 'fr' },
  })
  expect(response.status()).toBe(201)
  const body: { data: { id: string } } = await response.json()
  try {
    let parent: string | null = null
    for (let level = 1; level <= 8; level++) {
      const created = await request.post(`/api/menus/${body.data.id}/items`, {
        headers,
        data: {
          label: `Niveau ${level} avec un libellé de navigation long`,
          kind: 'url',
          url: '/qa-e2e-ready',
          parent,
        },
      })
      expect(created.status()).toBe(201)
      const item: { data: { id: string; depth: number } } = await created.json()
      expect(item.data.depth).toBe(level - 1)
      parent = item.data.id
    }
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto('/admin/menus')
    await page.getByLabel('Menu', { exact: true }).selectOption(body.data.id)
    const deepest = page.getByText('Niveau 8 avec un libellé de navigation long', { exact: true })
    await expect(deepest).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true)
    const edit = page.getByRole('button', {
      name: "Modifier l'élément : Niveau 8 avec un libellé de navigation long",
      exact: true,
    })
    await edit.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await info.attach('Huit niveaux de menu sur 320 pixels', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  } finally {
    expect(
      (await request.delete(`/api/menus/${body.data.id}?cascade=true`, { headers })).status(),
    ).toBe(204)
  }
})

test('missing order, customer, subscription and agent detail pages explain the failure and allow returning', async ({
  page,
}, info) => {
  for (const [path, message] of [
    ['/commerce/orders/absent', "Cette commande n'existe pas."],
    ['/commerce/customers/absent', "Ce client n'existe pas."],
    ['/commerce/subscriptions/absent', "Cet abonnement n'existe pas."],
    ['/agents/absent', "Cet agent n'existe pas ou plus."],
  ]) {
    await page.goto(`/admin${path}`)
    await expect(page.getByText(message ?? '', { exact: true })).toBeVisible()
    await expect(page.locator('main h1')).toHaveCount(1)
    await expect(page.locator('main').getByRole('link', { name: /Retour/u })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true)
    await info.attach(`État introuvable ${path}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  }
})
