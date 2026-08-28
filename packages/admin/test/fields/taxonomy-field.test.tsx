import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../src/auth/auth-context.js'
import { TaxonomyField } from '../../src/fields/taxonomy-field.js'
import { SchemaProvider } from '../../src/schema/schema-context.js'
import type { SchemaField } from '../../src/schema/types.js'

/**
 * `f.taxonomy({ of, many })` (`08-taxonomies.md`, task 5) — the picker
 * gains search, a parent mention for a child term, and a quick-create
 * control for a role that may create terms.
 *
 * Wrapped directly in `AuthProvider`/`SchemaProvider` rather than the whole
 * `App` (`global-search.test.tsx` does the same): the field only needs a
 * session and the schema document, not a route.
 */

const TOKEN = 'field-token'

const SCHEMA_DOCUMENT = {
  contract: 'schema@2.0',
  collections: [],
  taxonomies: [
    {
      name: 'topic',
      labels: { singular: { en: 'Topic' } },
      hierarchical: true,
      permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
    },
  ],
}

const CUISINE = {
  id: 'term-cuisine',
  taxonomy: 'topic',
  parent: null,
  slug: 'cuisine',
  labels: { en: 'Cuisine' },
  position: 0,
  depth: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const DESSERTS = {
  id: 'term-desserts',
  taxonomy: 'topic',
  parent: 'term-cuisine',
  slug: 'desserts',
  labels: { en: 'Desserts' },
  position: 0,
  depth: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function field(overrides: Partial<SchemaField['options']> = {}, many = true): SchemaField {
  return {
    name: 'topics',
    kind: 'taxonomy',
    required: false,
    localized: false,
    unique: false,
    hasCustomValidation: false,
    options: { of: 'topic', many, ...overrides },
  }
}

function stubFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | null,
): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    if (url.endsWith('/api/auth/session')) {
      return jsonResponse(200, {
        data: { id: 'user-1', email: 'editor@example.com', roles: ['editor'] },
      })
    }
    if (url.endsWith('/api/schema')) {
      return jsonResponse(200, { data: SCHEMA_DOCUMENT })
    }
    const found = handler(url, init)
    if (found !== null) return found
    throw new Error(`Unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

async function renderField(
  terms: readonly unknown[],
  many = true,
): Promise<{ readonly onChange: ReturnType<typeof vi.fn> }> {
  localStorage.setItem('cogenta.session.token', TOKEN)
  const onChange = vi.fn()

  stubFetch((url) => {
    if (url.includes('/api/taxonomies/topic') && !url.includes('term-')) {
      return jsonResponse(200, { data: terms })
    }
    return null
  })

  render(
    <AuthProvider>
      <SchemaProvider>
        <TaxonomyField
          id="topics"
          field={field({}, many)}
          value={many ? [] : null}
          onChange={onChange}
        />
      </SchemaProvider>
    </AuthProvider>,
  )

  await screen.findByText('Cuisine')
  return { onChange }
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('TaxonomyField', () => {
  it('lists the terms and reports a to-many selection as an array of ids', async () => {
    const { onChange } = await renderField([CUISINE, DESSERTS])

    const select = screen.getByRole('listbox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: ['term-cuisine'] } })

    expect(onChange).toHaveBeenCalledWith(['term-cuisine'])
  })

  it('shows a child term’s parent alongside it', async () => {
    await renderField([CUISINE, DESSERTS])

    // "Desserts" is a child of "Cuisine" — the acceptance criterion is that
    // it says so without the reader needing the indentation as context.
    expect(
      screen.getByText((content) => content.includes('Desserts') && content.includes('Cuisine')),
    ).toBeDefined()
  })

  it('filters the list by label or slug, case- and accent-insensitively', async () => {
    const many = [
      CUISINE,
      DESSERTS,
      { ...CUISINE, id: 'term-voyage', slug: 'voyage', labels: { en: 'Travel' }, position: 1 },
    ]
    await renderField(many)

    const search = screen.getByLabelText('Filtrer les termes')
    fireEvent.change(search, { target: { value: 'CUISINE' } })

    expect(screen.getByText('Cuisine')).toBeDefined()
    expect(screen.queryByText('Travel')).toBeNull()
  })

  it('respects many: false by writing a single id, not an array', async () => {
    const { onChange } = await renderField([CUISINE, DESSERTS], false)

    const select = screen.getByRole('combobox', { name: 'topics' }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'term-cuisine' } })

    expect(onChange).toHaveBeenCalledWith('term-cuisine')
  })

  it('creates a term from the field itself and selects it, for a role that may create', async () => {
    localStorage.setItem('cogenta.session.token', TOKEN)
    const onChange = vi.fn()
    let created: unknown
    let requestBody: Record<string, unknown> | undefined

    stubFetch((url, init) => {
      if (url.includes('/api/taxonomies/topic') && init?.method === 'POST') {
        requestBody = JSON.parse(init.body as string)
        created = {
          id: 'term-new',
          taxonomy: 'topic',
          parent: null,
          slug: 'local',
          labels: { en: 'Local' },
          position: 1,
          depth: 0,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        }
        return jsonResponse(201, { data: created })
      }
      if (url.includes('/api/taxonomies/topic')) {
        return jsonResponse(200, { data: [CUISINE] })
      }
      return null
    })

    render(
      <AuthProvider>
        <SchemaProvider>
          <TaxonomyField id="topics" field={field()} value={[]} onChange={onChange} />
        </SchemaProvider>
      </AuthProvider>,
    )
    await screen.findByText('Cuisine')

    // No term is selected in the field, so there is nothing to show as a
    // parent context — the 41-taxonomies fix must not invent one.
    expect(screen.queryByText(/Sera créé sous/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Libellé du nouveau terme'), {
      target: { value: 'Local' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['term-new']))
    expect(created).toMatchObject({ slug: 'local' })
    // No regression (41-taxonomies): with no parent in context, the term is
    // still created at the root — `parent` is sent as `null`, not omitted.
    expect(requestBody).toMatchObject({ slug: 'local', parent: null })
  })

  it('creates a term under the term currently selected in the field (41-taxonomies)', async () => {
    localStorage.setItem('cogenta.session.token', TOKEN)
    const onChange = vi.fn()
    let requestBody: Record<string, unknown> | undefined

    stubFetch((url, init) => {
      if (url.includes('/api/taxonomies/topic') && init?.method === 'POST') {
        requestBody = JSON.parse(init.body as string)
        return jsonResponse(201, {
          data: {
            id: 'term-local',
            taxonomy: 'topic',
            parent: 'term-cuisine',
            slug: 'local',
            labels: { en: 'Local' },
            position: 1,
            depth: 1,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          },
        })
      }
      if (url.includes('/api/taxonomies/topic')) {
        return jsonResponse(200, { data: [CUISINE, DESSERTS] })
      }
      return null
    })

    render(
      <AuthProvider>
        <SchemaProvider>
          {/* "Cuisine" is already selected in the field — the context a real
              editor would be in after picking a category, then realising the
              sub-category they need does not exist yet. */}
          <TaxonomyField id="topics" field={field()} value={['term-cuisine']} onChange={onChange} />
        </SchemaProvider>
      </AuthProvider>,
    )
    await screen.findByText('Cuisine')

    // The parent context is shown before the editor even clicks "Add".
    expect(screen.getByText('Sera créé sous « Cuisine ».')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Libellé du nouveau terme'), {
      target: { value: 'Local' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['term-cuisine', 'term-local']))
    expect(requestBody).toMatchObject({ slug: 'local', parent: 'term-cuisine' })
  })

  it('offers no quick-create control to a role that may not create terms', async () => {
    localStorage.setItem('cogenta.session.token', TOKEN)
    stubFetch((url) => {
      if (url.endsWith('/api/auth/session')) return null
      if (url.includes('/api/taxonomies/topic')) return jsonResponse(200, { data: [CUISINE] })
      return null
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.endsWith('/api/auth/session')) {
          return jsonResponse(200, {
            data: { id: 'user-1', email: 'viewer@example.com', roles: ['viewer'] },
          })
        }
        if (url.endsWith('/api/schema')) return jsonResponse(200, { data: SCHEMA_DOCUMENT })
        if (url.includes('/api/taxonomies/topic')) return jsonResponse(200, { data: [CUISINE] })
        throw new Error(`Unexpected fetch: ${url}`)
      }),
    )

    render(
      <AuthProvider>
        <SchemaProvider>
          <TaxonomyField id="topics" field={field()} value={[]} onChange={vi.fn()} />
        </SchemaProvider>
      </AuthProvider>,
    )
    await screen.findByText('Cuisine')

    expect(screen.queryByLabelText('Libellé du nouveau terme')).toBeNull()
  })
})
