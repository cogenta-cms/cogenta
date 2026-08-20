import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asEditor, asPublic, createHarness, dataOf, type Harness, request } from './harness.js'

interface MatrixRow {
  readonly root: { readonly id: string; readonly locale: string }
  readonly cells: Record<
    string,
    {
      readonly id: string
      readonly status: string
      readonly updatedAt: string
      readonly obsolete: boolean
    }
  >
}

function matrixOf(response: { readonly body: unknown }): MatrixRow[] {
  const body = response.body as { data?: unknown }
  return Array.isArray(body.data) ? (body.data as MatrixRow[]) : []
}

describe('GET /{collection}/-/translation-matrix', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('shows one row per root, with a cell for each locale that has an entry', async () => {
    const source = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Hello', slug: 'hello' }, locale: 'en', status: 'published' },
      }),
      asEditor,
    )
    const sourceId = dataOf(source)['id'] as string

    await harness.router.handle(
      request('POST', '/rest_page', {
        body: {
          values: { title: 'Bonjour', slug: 'bonjour' },
          locale: 'fr',
          translationOf: sourceId,
        },
      }),
      asEditor,
    )

    // A second root with no translation at all — its row must still appear,
    // with only its own locale as a cell.
    await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Alone', slug: 'alone' }, locale: 'en' },
      }),
      asEditor,
    )

    const response = await harness.router.handle(
      request('GET', '/rest_page/-/translation-matrix'),
      asEditor,
    )
    expect(response.status).toBe(200)
    const rows = matrixOf(response)
    expect(rows).toHaveLength(2)

    const withFrench = rows.find((row) => row.root.id === sourceId)
    expect(withFrench).toBeDefined()
    expect(Object.keys(withFrench?.cells ?? {}).sort()).toEqual(['en', 'fr'])
    expect(withFrench?.cells['en']?.status).toBe('published')
    expect(withFrench?.cells['fr']?.status).toBe('draft')
    expect(withFrench?.cells['fr']?.obsolete).toBe(false)

    const alone = rows.find((row) => row.root.id !== sourceId)
    expect(Object.keys(alone?.cells ?? {})).toEqual(['en'])
  })

  it('marks a translation obsolete once the source changes after it (task 2)', async () => {
    // Deliberately left as drafts, never published: on a `versioning.drafts`
    // collection (`rest_page` has one) an edit to an already-*published*
    // entry lands as a version overlay and never touches the live row's
    // `updatedAt` until that edit is itself published — `updatedAt` is the
    // live face's own clock, the same one `history()` and every cache tag
    // already key off. Signal (a) inherits that honestly rather than
    // inventing a second notion of "changed" just for this dashboard.
    const source = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Hello', slug: 'hello' }, locale: 'en' },
      }),
      asEditor,
    )
    const sourceId = dataOf(source)['id'] as string

    const translation = await harness.router.handle(
      request('POST', '/rest_page', {
        body: {
          values: { title: 'Bonjour', slug: 'bonjour' },
          locale: 'fr',
          translationOf: sourceId,
        },
      }),
      asEditor,
    )
    const translationId = dataOf(translation)['id'] as string

    // Not obsolete right after both were written.
    const before = await harness.router.handle(
      request('GET', '/rest_page/-/translation-matrix'),
      asEditor,
    )
    const beforeRow = matrixOf(before).find((row) => row.root.id === sourceId)
    expect(beforeRow?.cells['fr']?.obsolete).toBe(false)

    // A real clock tick, not a fake one: signal (a) is a plain string
    // comparison of two ISO 8601 timestamps, so the two writes must not land
    // in the same millisecond or the comparison is a tie rather than a test.
    await new Promise((resolve) => setTimeout(resolve, 5))

    // Touching the source only — the fiche's signal (a): a plain `updatedAt`
    // comparison, not a stored source version.
    await harness.router.handle(
      request('PATCH', `/rest_page/${sourceId}`, { body: { values: { title: 'Hello again' } } }),
      asEditor,
    )

    const after = await harness.router.handle(
      request('GET', '/rest_page/-/translation-matrix'),
      asEditor,
    )
    const afterRow = matrixOf(after).find((row) => row.root.id === sourceId)
    expect(afterRow?.cells['fr']?.obsolete).toBe(true)
    expect(afterRow?.cells['fr']?.id).toBe(translationId)
    // The root's own cell is never "obsolete against itself".
    expect(afterRow?.cells['en']?.obsolete).toBe(false)
  })

  it('refuses a public actor, the same gate as translations()', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_page/-/translation-matrix'),
      asPublic,
    )
    expect(response.status).toBe(403)
  })

  it('leaves an unpublished root out of a public view (draft gate applies per row)', async () => {
    await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Draft only', slug: 'draft-only' }, locale: 'en' },
      }),
      asEditor,
    )

    // The public role cannot even ask for the working state this route needs,
    // so it is refused outright rather than shown an empty matrix — matching
    // `translations()`'s own gate.
    const response = await harness.router.handle(
      request('GET', '/rest_page/-/translation-matrix'),
      asPublic,
    )
    expect(response.status).toBe(403)
  })
})
