import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asEditor, bodyOf, createHarness, dataOf, type Harness, request } from './harness.js'

/**
 * What a page builder form sends is checked before it is stored (L36 audit).
 *
 * Found by a real run: a hero whose image had been cleared was stored as
 * `media: null` and crashed the public page on the next request.
 */
describe('writing blocks', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  const write = (blocks: unknown[]) =>
    harness.router.handle(
      request('POST', '/rest_article', {
        body: { values: { title: 'Page' }, blocks: { zone: blocks } },
      }),
      asEditor,
    )

  it('stores an optional field a form left empty as absent, not as an empty value', async () => {
    const response = await write([
      {
        key: 'hero',
        type: 'hero',
        data: { eyebrow: '', title: 'Titre', subtitle: '', media: null, actions: [] },
      },
    ])

    expect(response.status).toBe(201)
    const zone = (dataOf(response)['blocks'] as { zone: { data: Record<string, unknown> }[] }).zone
    expect(zone[0]?.data).toEqual({ title: 'Titre', actions: [] })
  })

  it('refuses a block contract B would not accept, naming the block and the field', async () => {
    const response = await write([{ key: 'hero', type: 'hero', data: { title: '', media: null } }])

    expect(response.status).toBe(400)
    const error = bodyOf(response)['error'] as { code: string }
    expect(error.code).toBe('BLOCK_INVALID')
    expect(JSON.stringify(error)).toContain('title')
  })

  it('leaves a block type it does not know to its own renderer', async () => {
    const response = await write([{ key: 'p', type: 'comparisonTable', data: { rows: [] } }])

    expect(response.status).toBe(201)
  })
})
