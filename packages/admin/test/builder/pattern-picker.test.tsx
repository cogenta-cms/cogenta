import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContentBlock } from '../../src/api/content-client.js'
import type { Pattern } from '../../src/api/patterns-client.js'
import { PatternPicker } from '../../src/builder/pattern-picker.js'

/**
 * The motif/model library panel, driven the way `PageBuilder` really drives
 * it — see `page-builder.test.tsx` for the builder's own half. This file
 * proves the panel's contract with the server (`/api/patterns`) and with its
 * caller (`onInsertPattern`/`onApplyTemplate`), never re-testing
 * `parsePatternFile`'s own logic (`patterns.test.ts` already does).
 *
 * Text assertions are in French: the admin's default language (ADR-0019),
 * as every other builder test in this directory already relies on.
 */

const HERO_BLOCK: ContentBlock = { key: 'stored-1', type: 'hero', data: { title: 'Welcome' } }

function patternFixture(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'pattern-1',
    name: 'Hero band',
    category: 'headers',
    kind: 'pattern',
    blocks: [HERO_BLOCK],
    provenance: 'human',
    provenanceDetail: null,
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
    ...overrides,
  }
}

let created: Record<string, unknown>[] = []
let deletedIds: string[] = []

function stubFetch(
  options: {
    readonly patterns?: readonly Pattern[]
    readonly templates?: readonly Pattern[]
    readonly forbidden?: boolean
  } = {},
): void {
  created = []
  deletedIds = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (options.forbidden === true) {
        return {
          ok: false,
          status: 403,
          json: async () => ({
            error: { code: 'FORBIDDEN', message: 'Access denied.' },
          }),
        } as unknown as Response
      }

      if (url.includes('/api/patterns') && method === 'GET') {
        const kind = new URL(url, 'http://localhost').searchParams.get('kind')
        const data = kind === 'template' ? (options.templates ?? []) : (options.patterns ?? [])
        return { ok: true, status: 200, json: async () => ({ data }) } as unknown as Response
      }
      if (url.includes('/api/patterns') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        created.push(body)
        return {
          ok: true,
          status: 201,
          json: async () => ({ data: patternFixture({ id: 'new-1', ...body }) }),
        } as unknown as Response
      }
      if (url.includes('/api/patterns/') && method === 'DELETE') {
        deletedIds.push(url.split('/').at(-1) ?? '')
        return { ok: true, status: 204, json: async () => null } as unknown as Response
      }
      throw new Error(`unhandled request in test: ${method} ${url}`)
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the pattern picker', () => {
  it('lists saved patterns and inserts one on request', async () => {
    stubFetch({ patterns: [patternFixture()] })
    const onInsertPattern = vi.fn()
    render(
      <PatternPicker
        token="token"
        blocks={[HERO_BLOCK]}
        selectedKeys={new Set()}
        onInsertPattern={onInsertPattern}
        onApplyTemplate={vi.fn()}
      />,
    )

    await screen.findByText('Hero band')
    fireEvent.click(screen.getByRole('button', { name: 'Insérer' }))
    expect(onInsertPattern).toHaveBeenCalledWith(patternFixture())
  })

  it('degrades quietly to "unavailable" for a role that is neither admin nor editor', async () => {
    stubFetch({ forbidden: true })
    render(
      <PatternPicker
        token="token"
        blocks={[]}
        selectedKeys={new Set()}
        onInsertPattern={vi.fn()}
        onApplyTemplate={vi.fn()}
      />,
    )
    expect(await screen.findByText(/administrateur et rédacteur/u)).not.toBeNull()
  })

  it('asks for explicit confirmation before applying a full-page model', async () => {
    const template = patternFixture({ id: 'tmpl-1', kind: 'template', name: 'Landing page' })
    stubFetch({ templates: [template] })
    const onApplyTemplate = vi.fn()
    render(
      <PatternPicker
        token="token"
        blocks={[HERO_BLOCK]}
        selectedKeys={new Set()}
        onInsertPattern={vi.fn()}
        onApplyTemplate={onApplyTemplate}
      />,
    )

    await screen.findByText('Landing page')
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser ce modèle' }))
    // Not applied yet — a modal stands in the way.
    expect(onApplyTemplate).not.toHaveBeenCalled()
    expect(await screen.findByText('Remplacer toute la page ?')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Remplacer la page' }))
    expect(onApplyTemplate).toHaveBeenCalledWith(template)
  })

  it('saves the current selection as a new pattern', async () => {
    stubFetch({})
    render(
      <PatternPicker
        token="token"
        blocks={[HERO_BLOCK, { key: 'k2', type: 'cta', data: {} }]}
        selectedKeys={new Set(['stored-1'])}
        onInsertPattern={vi.fn()}
        onApplyTemplate={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'My header' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer dans la bibliothèque' }))

    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({
      name: 'My header',
      kind: 'pattern',
      blocks: [HERO_BLOCK],
    })
  })

  it('deletes a pattern from the library', async () => {
    stubFetch({ patterns: [patternFixture()] })
    render(
      <PatternPicker
        token="token"
        blocks={[]}
        selectedKeys={new Set()}
        onInsertPattern={vi.fn()}
        onApplyTemplate={vi.fn()}
      />,
    )

    await screen.findByText('Hero band')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer « Hero band »' }))
    await waitFor(() => expect(deletedIds).toEqual(['pattern-1']))
  })
})
