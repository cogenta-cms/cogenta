import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, loginToken, test } from './fixtures.js'

test('public conditional multipart form preserves every selected choice and file', async ({
  page,
  request,
  adminToken,
}, info) => {
  const name = `contact-${info.project.name}-${Date.now()}`
  const headers = { authorization: `Bearer ${adminToken}` }
  const created = await request.post('/api/forms', {
    headers,
    data: {
      name,
      label: 'Contact de recette',
      fields: [
        { name: 'email', label: 'E-mail', kind: 'email', required: true },
        {
          name: 'method',
          label: 'Contact',
          kind: 'choiceSingle',
          required: true,
          choices: ['email', 'phone'],
        },
        {
          name: 'phone',
          label: 'Téléphone',
          kind: 'phone',
          required: true,
          showIf: { field: 'method', operator: 'equals', value: 'phone' },
        },
        { name: 'topics', label: 'Sujets', kind: 'choiceMulti', choices: ['alpha', 'beta'] },
        { name: 'resume', label: 'Fichier', kind: 'file', required: true },
      ],
    },
  })
  expect(created.status()).toBe(201)
  await page.goto(`/forms/${name}`)
  await page.getByLabel(/^E-mail/u).fill('visitor@e2e.example.test')
  await page.getByLabel(/^Contact/u).selectOption('email')
  const phone = page.getByLabel(/^Téléphone/u)
  await expect(phone).toBeHidden()
  await expect(phone).toBeDisabled()
  await page.getByLabel(/^Contact/u).selectOption('phone')
  await expect(phone).toBeVisible()
  await expect(phone).toHaveAttribute('required', '')
  await page.getByLabel(/^Contact/u).selectOption('email')
  await page.getByLabel('alpha', { exact: true }).check()
  await page.getByLabel('beta', { exact: true }).check()
  await page.getByLabel(/^Fichier/u).setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  // Exercise the real minimum fill delay, instead of changing its hidden timestamp.
  await page.waitForTimeout(3100)
  await info.attach('Formulaire conditionnel', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await expect(
    page.getByText('Merci — votre message a bien été reçu.', { exact: true }),
  ).toBeVisible()
  const submissions = await request.get('/api/forms/submissions', { headers })
  const body: { data: { formId: string; values: Record<string, unknown> }[] } =
    await submissions.json()
  const form: { data: { id: string } } = await created.json()
  const submission = body.data.find((entry) => entry.formId === form.data.id)
  expect(submission?.values['topics']).toEqual(['alpha', 'beta'])
  expect(submission?.values['phone']).toBeUndefined()
  expect(submission?.values['resume']).toMatchObject({ filename: 'pixel.png' })
})

test('editorial workflow remains available through submission, approval and publication', async ({
  browser,
  page,
  request,
  adminToken,
}, info) => {
  const headers = { authorization: `Bearer ${adminToken}` }
  const slug = `review-${info.project.name}-${Date.now()}`
  const created = await request.post('/api/content/article', {
    headers,
    data: { values: { title: 'Article à relire', slug } },
  })
  expect(created.status()).toBe(201)
  const body: { data: { id: string } } = await created.json()
  await page.addInitScript((token) => {
    localStorage.setItem('cogenta.session.token', token)
    localStorage.setItem('cogenta.admin.language', 'fr')
  }, adminToken)
  await page.goto(`/admin/collections/article/${body.data.id}`)
  const contributorToken = await loginToken(request, 'editor')
  const contributorContext = await browser.newContext({
    viewport: page.viewportSize(),
    locale: 'fr-FR',
  })
  await contributorContext.addInitScript(
    (token) => localStorage.setItem('cogenta.session.token', token),
    contributorToken,
  )
  const contributorPage = await contributorContext.newPage()
  await contributorPage.goto(`/admin/collections/article/${body.data.id}`)
  await contributorPage.getByRole('button', { name: 'Soumettre à relecture', exact: true }).click()
  await expect(contributorPage.getByText('En attente de relecture', { exact: true })).toBeVisible()
  await contributorContext.close()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Approuver', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Approuver', exact: true }).click()
  await expect(page.getByText('Approuvé', { exact: true })).toBeVisible()
  await info.attach('Workflow approuvé', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  expect(
    (await request.post(`/api/content/article/${body.data.id}/publish`, { headers })).status(),
  ).toBe(200)
  expect((await request.get(`/articles/${slug}`)).status()).toBe(200)
})

test('human administrator reviews a real pending MCP mutation before it can execute', async ({
  page,
  request,
  adminToken,
}, info) => {
  const metadata: { root: string } = JSON.parse(
    await readFile(resolve('.cogenta/e2e-fixture.json'), 'utf8'),
  )
  const child = spawn(
    process.execPath,
    [resolve('packages/cli/dist/bin.js'), 'mcp', '--role', 'editor'],
    {
      cwd: metadata.root,
      env: { ...process.env, COGENTA_AUTH_SIGNING_KEY: 'browser-fixture-signing-key-not-a-secret' },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  let output = ''
  let diagnostic = ''
  child.stderr.on('data', (chunk: Buffer) => {
    diagnostic += chunk.toString('utf8')
  })
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })
  const headers = { authorization: `Bearer ${adminToken}` }
  const title = `MCP approuvé ${info.project.name} ${Date.now()}`
  const send = (id: number, name: string) =>
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'content.write_draft', arguments: { collection: 'page', values: { title: name } } } })}\n`,
    )
  try {
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'cogenta-browser-qa', version: '1' } } })}\n`,
    )
    await expect.poll(() => output, { timeout: 30_000 }).toContain('"id":1')
    send(41, title)
    await expect
      .poll(async () => {
        const result: { data: { input: { values?: { title?: string } } }[] } = await (
          await request.get('/api/agent-approvals', { headers })
        ).json()
        return result.data.some((entry) => entry.input.values?.title === title)
      })
      .toBe(true)
    expect(output).not.toContain('"id":41')
    const viewer = await loginToken(request, 'viewer')
    expect(
      (
        await request.get('/api/agent-approvals', {
          headers: { authorization: `Bearer ${viewer}` },
        })
      ).status(),
    ).toBe(403)
    await page.addInitScript((token) => {
      localStorage.setItem('cogenta.session.token', token)
      localStorage.setItem('cogenta.admin.language', 'fr')
    }, adminToken)
    await page.goto('/admin/agents')
    await expect(page.getByText(title, { exact: false }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Examiner l’action', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(output).not.toContain('"id":41')
    await info.attach('Confirmation humaine MCP', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    await page.getByRole('button', { name: 'Autoriser cette action', exact: true }).click()
    await expect.poll(() => output).toContain('"id":41')
    const reply: { result: { isError: boolean; content: { text: string }[] } } = JSON.parse(
      output
        .trim()
        .split('\n')
        .find((line) => line.includes('"id":41')) ?? '{}',
    )
    expect(reply.result.isError).toBe(false)
    expect(JSON.parse(reply.result.content[0]?.text ?? '{}')).toMatchObject({
      locale: 'fr',
      values: { title },
    })
    send(42, `${title} refusé`)
    await expect(page.getByRole('button', { name: 'Refuser', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Refuser', exact: true }).click()
    await expect.poll(() => output).toContain('"id":42')
    expect(output.split('\n').find((line) => line.includes('"id":42'))).toContain('"isError":true')
  } finally {
    await info.attach('MCP protocol diagnostic', {
      body: Buffer.from(output + '\n' + diagnostic),
      contentType: 'text/plain',
    })
    child.stdin.end()
    await new Promise<void>((done) => {
      if (child.exitCode !== null) done()
      else {
        child.once('exit', () => done())
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
        }, 3000)
        timer.unref()
      }
    })
  }
})
